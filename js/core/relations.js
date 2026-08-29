/**
 * Relations — what a decision implies across the connection graph.
 *
 * The canvas lets you say a task depends on another, blocks another, or is an
 * oxygen choice against another. Those statements are worthless if acting on a
 * task can quietly ignore them. This module turns a proposed action into an
 * explicit plan, so the UI can either apply it or make the person resolve it.
 *
 * Three kinds of consequence, and they are not the same kind of thing:
 *
 *   pull    depends / blocks / waiting / bundle — the other task has to come
 *           along, or the commitment is a lie. Followed transitively, so a
 *           chain arrives whole. Optional: you may knowingly take just the one.
 *
 *   drop    either — an oxygen choice. Only one of these is getting done, and
 *           committing to one arm (or finishing it) is how that choice gets
 *           made. Every other arm is dropped. Not optional: if you could commit
 *           to one and leave the rest sitting in the backlog, the connection
 *           never meant anything.
 *
 *   warn    conflicts, dates outside the window, work left permanently blocked.
 *           Reported, never decided for you.
 *
 * Nothing here mutates. plan*() answers a question; applyPlan() acts.
 */
import {
  state, getItem, getSprint, batch, assignToSprint, updateItem,
  dropItem, restoreItem, dateFitsSprint, isDropped, isLive, PREREQ_TYPES,
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
 * Tasks this one needs first. Connection direction is "from needs to", so
 * prerequisites are the targets of outgoing depends / blocks / waiting edges.
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

/* --------------------------------------------------- oxygen choices */

/**
 * Every other arm of an oxygen choice.
 *
 * Exclusivity is transitive by intent: if you'll only do one of A or B, and only
 * one of B or C, you're picking one of the three. So the group is the connected
 * component over either/or edges rather than just the direct partners — which
 * falls out of the graph without storing anything new.
 */
export function exclusiveGroup(itemId) {
  const seen = new Set([itemId]);
  const queue = [itemId];
  const out = [];
  while (queue.length) {
    const current = queue.shift();
    for (const partner of partnersOf(current, EXCLUSIVE_TYPES)) {
      if (seen.has(partner.id)) continue;
      seen.add(partner.id);
      queue.push(partner.id);
      const found = getItem(partner.id);
      if (found) out.push({ id: partner.id, item: found.item, bucket: found.bucket });
    }
  }
  return out;
}

/**
 * Split the rivals of everything in `moving` into what to drop and what already
 * settled. A rival that is finished is not something this can resolve — that
 * choice was made, and picking this arm now argues with it. Say so; don't
 * pretend to fix it.
 */
function resolveRivals(moving) {
  const drop = new Map();
  const settled = [];
  const movingSet = new Set(moving);
  for (const id of moving) {
    const mine = getItem(id);
    if (!mine) continue;
    for (const rival of exclusiveGroup(id)) {
      if (movingSet.has(rival.id) || drop.has(rival.id) || isDropped(rival.item)) continue;
      if (rival.item.status === 'done') {
        settled.push({ ...rival, against: mine.item });
        continue;
      }
      drop.set(rival.id, { ...rival, reason: 'either', via: id });
    }
  }
  return { drop: [...drop.values()], settled };
}

/** Live work that dropping these would leave permanently blocked. */
function strandedByDropping(ids) {
  const out = [];
  const dropping = new Set(ids);
  for (const id of ids) {
    const source = getItem(id);
    for (const dep of dependentsOf(id)) {
      if (dropping.has(dep.id)) continue;
      const found = getItem(dep.id);
      if (found && isLive(found.item) && found.item.status !== 'done') {
        out.push({ item: found.item, bucket: found.bucket, blockedBy: source.item });
      }
    }
  }
  return out;
}

const emptyPlan = (over) => ({
  pull: [], drop: [], settled: [], stranded: [], clashes: [], offWindow: [],
  contradictions: [], strand: [], ...over,
});

/* ------------------------------------------------- committing to a sprint */

/**
 * What would happen if this task moved into this sprint.
 *
 * @param {string} itemId
 * @param {string|null} sprintId  null means "back to the backlog"
 */
export function planMove(itemId, sprintId) {
  const subject = getItem(itemId);
  if (!subject) return null;
  if (!sprintId) return planReturn(itemId, subject);

  const sprint = getSprint(sprintId);
  const pull = new Map();
  const seen = new Set([itemId]);
  const queue = [itemId];

  /* Walk the prerequisite and do-together graph outward. A prerequisite that is
     done needs nothing; one already in this sprint needs nothing either, but its
     own prerequisites still might. A dropped one is a dead end — and a warning,
     handled further down. */
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
      if (!found || found.item.status === 'done' || isDropped(found.item)) continue;
      queue.push(step.id);
      if (found.item.sprintId === sprintId) continue;
      pull.set(step.id, entry(step.id, { reason: step.reason, via: current }));
    }
  }

  const moving = [itemId, ...pull.keys()];
  const { drop, settled } = resolveRivals(moving);
  const stranded = strandedByDropping(drop.map((d) => d.id));

  /* Two arms of one oxygen choice dragged in together by prerequisites. Nothing
     here can pick for you. */
  const contradictions = [];
  for (const id of moving) {
    for (const partner of partnersOf(id, EXCLUSIVE_TYPES)) {
      if (!moving.includes(partner.id) || id >= partner.id) continue;
      const a = getItem(id);
      const b = getItem(partner.id);
      if (a && b) contradictions.push({ a: a.item, b: b.item });
    }
  }

  /* Same-slot conflicts already in the sprint. Worth saying, not worth blocking. */
  const clashes = [];
  for (const id of moving) {
    const mine = getItem(id);
    for (const partner of partnersOf(id, CLASH_TYPES)) {
      const found = getItem(partner.id);
      if (!found || found.item.sprintId !== sprintId || !isLive(found.item)) continue;
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

  return emptyPlan({
    kind: 'commit',
    itemId,
    sprintId,
    sprint,
    subject,
    pull: pulled,
    drop,
    settled,
    stranded,
    clashes,
    offWindow,
    contradictions,
    /* An off-window date is worth showing but not worth interrupting for: most
       backlog tasks are dated beyond any two-week horizon, so making it open a
       dialog would fire on nearly every commit and teach people to dismiss the
       dialog unread — the exact habit that makes it useless on the day it has
       something real to say. It is surfaced passively instead. */
    needsAttention: !!(pulled.length || drop.length || settled.length
      || clashes.length || contradictions.length),
  });
}

/**
 * Moving a task back to the backlog. The mirror risk: anything still committed
 * that was counting on this task now has nothing to start from.
 */
function planReturn(itemId, subject) {
  const from = subject.item.sprintId;
  const strand = [];
  if (from) {
    for (const dep of dependentsOf(itemId)) {
      const found = getItem(dep.id);
      if (found && found.item.sprintId === from
        && found.item.status !== 'done' && isLive(found.item)) {
        strand.push(entry(dep.id, { reason: dep.type }));
      }
    }
  }
  return emptyPlan({
    kind: 'return',
    itemId,
    sprintId: null,
    sprint: getSprint(from),
    subject,
    strand: strand.filter(Boolean),
    needsAttention: strand.length > 0,
  });
}

/* ------------------------------------------------------ finishing a task */

/**
 * Finishing an arm of an oxygen choice settles it just as committing does — you
 * cannot have done one and still be undecided.
 */
export function planComplete(itemId) {
  const subject = getItem(itemId);
  if (!subject) return null;
  const { drop, settled } = resolveRivals([itemId]);
  const stranded = strandedByDropping(drop.map((d) => d.id));
  return emptyPlan({
    kind: 'complete',
    itemId,
    subject,
    drop,
    settled,
    stranded,
    needsAttention: !!(drop.length || settled.length),
  });
}

/* ------------------------------------------------------ un-dropping a task */

/**
 * Reviving a dropped task re-opens the choice it lost, so whichever arm won has
 * to give the oxygen back.
 */
export function planRestore(itemId) {
  const subject = getItem(itemId);
  if (!subject) return null;
  const drop = [];
  const settled = [];
  for (const rival of exclusiveGroup(itemId)) {
    if (isDropped(rival.item)) continue;
    if (rival.item.status === 'done') settled.push({ ...rival, against: subject.item });
    else drop.push({ ...rival, reason: 'either', via: itemId });
  }
  return emptyPlan({
    kind: 'restore',
    itemId,
    subject,
    drop,
    settled,
    stranded: strandedByDropping(drop.map((d) => d.id)),
    needsAttention: !!(drop.length || settled.length),
  });
}

/* --------------------------------------------------------- applying */

/**
 * Carry out a plan as a single undoable step.
 *
 * Drops are applied unconditionally: they are the consequence of a decision the
 * person just made, not a menu of options. Pulls are opt-in per task, which is
 * why only they read from `choices`.
 *
 * @param {object} plan
 * @param {{pull?:Set<string>, strand?:Set<string>, status?:string}} choices
 */
export function applyPlan(plan, choices = {}) {
  if (!plan) return;
  const take = choices.pull || new Set();
  const send = choices.strand || new Set();

  batch(() => {
    for (const e of plan.drop) dropItem(e.id);

    if (plan.kind === 'return') {
      assignToSprint(plan.itemId, null);
      for (const e of plan.strand) if (send.has(e.id)) assignToSprint(e.id, null);
      return;
    }
    if (plan.kind === 'complete') {
      updateItem(plan.itemId, { status: 'done' });
      return;
    }
    if (plan.kind === 'restore') {
      restoreItem(plan.itemId);
      return;
    }
    assignToSprint(plan.itemId, plan.sprintId, choices.status || 'todo');
    for (const e of plan.pull) if (take.has(e.id)) assignToSprint(e.id, plan.sprintId, 'todo');
  });
}

/** Everything a plan proposes, accepted wholesale. */
export const acceptAll = (plan) => ({
  pull: new Set(plan.pull.map((e) => e.id)),
  strand: new Set((plan.strand || []).map((e) => e.id)),
});

/** Just the one task; optional related work left where it is. */
export const acceptNone = () => ({ pull: new Set(), strand: new Set() });
