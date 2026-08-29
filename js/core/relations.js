/**
 * Relations — what a sprint move implies across the connection graph.
 *
 * The canvas lets you say a task depends on another, blocks another, is an
 * either/or against another. Those statements are worthless if committing to a
 * task can quietly ignore them. This module turns a proposed move into an
 * explicit plan, so the UI can either apply it or make the person resolve it.
 *
 * The three relations that matter for planning, and why they differ:
 *
 *   pull    depends / blocks / waiting / bundle — the other task has to come
 *           along, or the commitment is a lie. Followed transitively: pulling
 *           in a prerequisite pulls in its prerequisites too.
 *
 *   evict   either — you cannot commit to both. If the partner is already in
 *           the sprint, one of them has to leave.
 *
 *   warn    conflicts, and dates that fall outside the sprint window. Neither
 *           is fatal, and neither should be decided for you.
 *
 * Nothing here mutates. planMove() answers a question; applyPlan() acts.
 */
import {
  state, getItem, getSprint, batch, assignToSprint, dateFitsSprint, PREREQ_TYPES,
} from './store.js';

export const TOGETHER_TYPES = ['bundle'];
export const EXCLUSIVE_TYPES = ['either'];
export const CLASH_TYPES = ['clash'];

/* ----------------------------------------------------------- lookups */

const isItem = (ep) => ep.kind === 'item';

/** Every connection touching this task, in either direction. */
export function edgesFor(itemId) {
  return state.edges.filter(
    (e) => (isItem(e.from) && e.from.id === itemId) || (isItem(e.to) && e.to.id === itemId)
  );
}

/**
 * Tasks this one needs first.
 *
 * Connection direction is "from needs to", so prerequisites are the targets of
 * outgoing depends / blocks / waiting edges.
 */
export function prerequisitesOf(itemId) {
  return state.edges
    .filter((e) => PREREQ_TYPES.includes(e.type)
      && isItem(e.from) && e.from.id === itemId && isItem(e.to))
    .map((e) => ({ id: e.to.id, type: e.type }));
}

/** Tasks that need this one. */
export function dependentsOf(itemId) {
  return state.edges
    .filter((e) => PREREQ_TYPES.includes(e.type)
      && isItem(e.to) && e.to.id === itemId && isItem(e.from))
    .map((e) => ({ id: e.from.id, type: e.type }));
}

/** Symmetric relations — direction carries no meaning for these types. */
export function partnersOf(itemId, types) {
  const out = [];
  for (const e of state.edges) {
    if (!types.includes(e.type) || !isItem(e.from) || !isItem(e.to)) continue;
    if (e.from.id === itemId) out.push({ id: e.to.id, type: e.type });
    else if (e.to.id === itemId) out.push({ id: e.from.id, type: e.type });
  }
  return out;
}

const entry = (id, extra) => {
  const found = getItem(id);
  return found ? { id, item: found.item, bucket: found.bucket, ...extra } : null;
};

/* -------------------------------------------------------- planning */

/**
 * What would happen if this task moved into this sprint.
 *
 * @param {string} itemId
 * @param {string|null} sprintId  null means "back to the backlog"
 * @returns {object|null} a plan; `needsAttention` is false when it is a plain move
 */
export function planMove(itemId, sprintId) {
  const subject = getItem(itemId);
  if (!subject) return null;
  if (!sprintId) return planReturn(itemId, subject);

  const sprint = getSprint(sprintId);
  const pull = new Map();
  const seen = new Set([itemId]);
  const queue = [itemId];

  /* Walk the prerequisite and do-together graph outward from the task. A
     prerequisite that is already done needs nothing; one already in this
     sprint needs nothing either, but its own prerequisites still might. */
  while (queue.length) {
    const current = queue.shift();
    const next = [
      ...prerequisitesOf(current).map((p) => ({ id: p.id, reason: p.type })),
      ...partnersOf(current, TOGETHER_TYPES).map((p) => ({ id: p.id, reason: 'bundle' })),
    ];
    for (const step of next) {
      if (seen.has(step.id)) continue;
      seen.add(step.id);
      const found = getItem(step.id);
      if (!found || found.item.status === 'done') continue;
      queue.push(step.id);
      if (found.item.sprintId === sprintId) continue;
      pull.set(step.id, entry(step.id, { reason: step.reason, via: current }));
    }
  }

  const moving = [itemId, ...pull.keys()];

  /* Either/or partners already committed here. One of the pair has to go. */
  const evict = new Map();
  for (const id of moving) {
    for (const partner of partnersOf(id, EXCLUSIVE_TYPES)) {
      if (pull.has(partner.id) || partner.id === itemId) continue;
      const found = getItem(partner.id);
      if (found && found.item.sprintId === sprintId) {
        evict.set(partner.id, entry(partner.id, { reason: 'either', against: id }));
      }
    }
  }

  /* An either/or pair that the pull walk dragged in together is not something
     this module can decide. Say so rather than picking one. */
  const contradictions = [];
  for (const id of moving) {
    for (const partner of partnersOf(id, EXCLUSIVE_TYPES)) {
      if (moving.includes(partner.id)) {
        const a = getItem(id);
        const b = getItem(partner.id);
        if (a && b && id < partner.id) {
          contradictions.push({ a: a.item, b: b.item });
        }
      }
    }
  }

  /* Same-slot conflicts already in the sprint. Worth saying, not worth blocking. */
  const clashes = [];
  for (const id of moving) {
    for (const partner of partnersOf(id, CLASH_TYPES)) {
      const found = getItem(partner.id);
      if (!found || found.item.sprintId !== sprintId) continue;
      const mine = getItem(id);
      clashes.push({
        item: found.item,
        bucket: found.bucket,
        against: mine.item,
        sameDay: !!(mine.item.date && found.item.date && mine.item.date === found.item.date),
      });
    }
  }

  /* Dates that fall outside the window being committed to. */
  const offWindow = [];
  for (const id of moving) {
    const found = getItem(id);
    if (found && !dateFitsSprint(found.item, sprint)) {
      offWindow.push({ item: found.item, bucket: found.bucket });
    }
  }

  const pulled = [...pull.values()].filter(Boolean);
  const evicted = [...evict.values()].filter(Boolean);

  return {
    kind: 'commit',
    itemId,
    sprintId,
    sprint,
    subject,
    pull: pulled,
    evict: evicted,
    clashes,
    offWindow,
    contradictions,
    /* A date outside the window is worth showing but not worth interrupting
       for: most backlog tasks are dated beyond any two-week horizon, so making
       it open a dialog would fire on nearly every commit and teach people to
       dismiss the dialog unread — which is exactly the habit that makes it
       useless on the day it has something real to say. It is surfaced passively
       instead, as a flag on the card and a line in the detail panel, and it
       still appears here when the dialog opens for a substantive reason. */
    needsAttention: !!(pulled.length || evicted.length || clashes.length
      || contradictions.length),
  };
}

/**
 * Moving a task back to the backlog.
 *
 * The risk here is the mirror image: anything still in the sprint that was
 * counting on this task is now committed to work it cannot start.
 */
function planReturn(itemId, subject) {
  const from = subject.item.sprintId;
  const strand = [];
  if (from) {
    for (const dep of dependentsOf(itemId)) {
      const found = getItem(dep.id);
      if (found && found.item.sprintId === from && found.item.status !== 'done') {
        strand.push(entry(dep.id, { reason: dep.type }));
      }
    }
  }
  return {
    kind: 'return',
    itemId,
    sprintId: null,
    sprint: getSprint(from),
    subject,
    strand: strand.filter(Boolean),
    pull: [],
    evict: [],
    clashes: [],
    offWindow: [],
    contradictions: [],
    needsAttention: strand.length > 0,
  };
}

/* --------------------------------------------------------- applying */

/**
 * Carry out a plan as a single undoable step.
 *
 * @param {object} plan
 * @param {{pull?:Set<string>, evict?:Set<string>, strand?:Set<string>, status?:string}} choices
 */
export function applyPlan(plan, choices = {}) {
  if (!plan) return;
  const take = choices.pull || new Set();
  const drop = choices.evict || new Set();
  const send = choices.strand || new Set();

  batch(() => {
    if (plan.kind === 'return') {
      assignToSprint(plan.itemId, null);
      for (const e of plan.strand) if (send.has(e.id)) assignToSprint(e.id, null);
      return;
    }
    for (const e of plan.evict) if (drop.has(e.id)) assignToSprint(e.id, null);
    assignToSprint(plan.itemId, plan.sprintId, choices.status || 'todo');
    for (const e of plan.pull) if (take.has(e.id)) assignToSprint(e.id, plan.sprintId, 'todo');
  });
}

/** Everything a plan proposes, accepted wholesale. */
export const acceptAll = (plan) => ({
  pull: new Set(plan.pull.map((e) => e.id)),
  evict: new Set(plan.evict.map((e) => e.id)),
  strand: new Set((plan.strand || []).map((e) => e.id)),
});

/** Just the one task, related work left where it is. */
export const acceptNone = () => ({ pull: new Set(), evict: new Set(), strand: new Set() });
