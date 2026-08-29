/**
 * The resolution dialog.
 *
 * Shown only when an action has consequences. A plain move opens nothing —
 * asking permission for a decision with no side effects trains people to
 * dismiss the dialog without reading it, which is the habit that makes it
 * useless on the day it matters.
 *
 * Note the asymmetry in what is offered. Pulled prerequisites are checkboxes:
 * you may knowingly commit to something without its dependencies. Dropped
 * rivals are not, because an oxygen choice has no version where you pick one
 * and leave the others available — that would make the connection decorative.
 */
import {
  planMove, planComplete, planRestore, applyPlan, acceptAll, acceptNone,
} from '../core/relations.js';
import { updateItem } from '../core/store.js';
import { el, $, clear } from '../util/dom.js';

const REASON = {
  depends: 'needed first',
  blocks: 'blocking this',
  waiting: 'waiting on this',
  bundle: 'do together',
};

let host;

export function initResolve() {
  host = $('#modal');
  host.addEventListener('click', (e) => { if (e.target === host) close(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !host.hidden) close();
  });
}

export const isDialogOpen = () => host && !host.hidden;

function close() {
  host.hidden = true;
  clear(host);
}

/* ---------------------------------------------------------- entry points */

/** Move a task into a sprint, or back to the backlog. */
export function requestMove(itemId, sprintId, status = 'todo') {
  run(planMove(itemId, sprintId), status);
}

/**
 * Change a task's status. Only finishing can settle an oxygen choice, so the
 * other transitions go straight through.
 */
export function requestStatus(itemId, status) {
  if (status !== 'done') { updateItem(itemId, { status }); return; }
  run(planComplete(itemId), status);
}

export { planComplete };

/** Bring a dropped task back. */
export function requestRestore(itemId) {
  run(planRestore(itemId), 'todo');
}

function run(plan, status) {
  if (!plan) return;
  if (!plan.needsAttention) { applyPlan(plan, { ...acceptNone(), status }); return; }
  open(plan, status);
}

/* ------------------------------------------------------------- dialog */

function open(plan, status) {
  clear(host);
  host.hidden = false;

  const chosen = acceptAll(plan);
  const box = el('div', { class: 'rs-box', role: 'dialog', 'aria-modal': 'true' });
  box.appendChild(el('header', { class: 'rs-head' }, [
    el('h2', { text: headline(plan) }),
    el('p', { class: 'rs-sub', text: plan.subject.item.title }),
  ]));

  const body = el('div', { class: 'rs-body' });

  if (plan.kind === 'return') {
    optional(body, 'Left without a prerequisite',
      'These stay committed but would have nothing to start from.',
      plan.strand, chosen.strand, 'strand');
  } else {
    optional(body, 'Comes along',
      'This task can’t be honestly committed to without them.',
      plan.pull, chosen.pull, 'pull');
  }

  /* The oxygen choice being resolved. Not a checkbox: this is the decision. */
  if (plan.drop.length) {
    const list = el('div', { class: 'rs-list' });
    for (const e of plan.drop) {
      list.appendChild(el('div', { class: 'rs-item fixed' }, [
        el('span', { class: 'rs-title', text: e.item.title }),
        el('span', { class: 'rs-tag drop', text: 'dropped' }),
        el('span', { class: 'rs-where', text: e.bucket.name }),
      ]));
    }
    body.appendChild(el('section', { class: 'rs-section' }, [
      el('h3', { text: plan.drop.length === 1 ? 'The one you’re not doing' : 'The ones you’re not doing' }),
      el('p', {
        class: 'rs-blurb',
        text: 'An either/or is a choice about where finite attention goes, and this is where it gets made. They keep their notes and connections, leave the backlog, and can be brought back.',
      }),
      list,
    ]));
  }

  if (plan.settled.length) {
    warn(body, 'You already decided this', plan.settled.map((e) =>
      `${e.item.title} is already done. Picking ${e.against.title} contradicts that — nothing here can undo it.`));
  }

  if (plan.contradictions.length) {
    warn(body, 'Can’t resolve this one', plan.contradictions.map((c) =>
      `${c.a.title} and ${c.b.title} are an either/or, but both are being pulled in. You'll have to drop one yourself.`));
  }

  if (plan.stranded.length) {
    warn(body, 'Left with nothing to start from', plan.stranded.map((e) =>
      `${e.item.title} needs ${e.blockedBy.title}, which is being dropped.`));
  }

  if (plan.clashes.length) {
    warn(body, 'Worth knowing', plan.clashes.map((c) =>
      `${c.against.title} conflicts with ${c.item.title}${c.sameDay ? ' — same day' : ''}.`));
  }

  if (plan.offWindow.length) {
    warn(body, 'Dated outside the window', plan.offWindow.map((c) =>
      `${c.item.title} is dated ${c.item.date}, outside this sprint.`));
  }

  box.appendChild(body);

  const go = el('button', { class: 'tool on', text: confirmLabel(plan) });
  go.addEventListener('click', () => { applyPlan(plan, { ...chosen, status }); close(); });

  const cancel = el('button', { class: 'tool', text: 'Cancel' });
  cancel.addEventListener('click', close);

  box.appendChild(el('footer', { class: 'rs-foot' }, [
    cancel, el('span', { class: 'spacer' }), go,
  ]));
  host.appendChild(box);
  go.focus();
}

function headline(plan) {
  if (plan.kind === 'return') return 'Send back to the backlog?';
  if (plan.kind === 'complete') {
    return plan.drop.length ? 'Finishing this settles the choice' : 'Mark done?';
  }
  if (plan.kind === 'restore') return 'Restore this and re-open the choice?';
  if (plan.drop.length) {
    return `Pick this for ${plan.sprint ? plan.sprint.name : 'the sprint'}?`;
  }
  return `Commit to ${plan.sprint ? plan.sprint.name : 'this sprint'}?`;
}

function confirmLabel(plan) {
  const n = plan.drop.length;
  const dropPart = n ? ` and drop ${n === 1 ? 'the other' : `the other ${n}`}` : '';
  if (plan.kind === 'return') return 'Send back';
  if (plan.kind === 'complete') return `Mark done${dropPart}`;
  if (plan.kind === 'restore') return `Restore${dropPart}`;
  return `Commit${dropPart}`;
}

function optional(parent, title, blurb, entries, chosenSet, kind) {
  if (!entries || !entries.length) return;
  const list = el('div', { class: 'rs-list' });
  for (const e of entries) {
    const box = el('input', { type: 'checkbox', checked: 'checked', id: `rs-${kind}-${e.id}` });
    box.addEventListener('change', () => {
      if (box.checked) chosenSet.add(e.id); else chosenSet.delete(e.id);
    });
    list.appendChild(el('label', { class: 'rs-item', for: `rs-${kind}-${e.id}` }, [
      box,
      el('span', { class: 'rs-title', text: e.item.title }),
      el('span', { class: 'rs-tag', text: REASON[e.reason] || e.reason }),
      el('span', { class: 'rs-where', text: e.bucket.name }),
    ]));
  }
  parent.appendChild(el('section', { class: 'rs-section' }, [
    el('h3', { text: title }),
    el('p', { class: 'rs-blurb', text: blurb }),
    list,
  ]));
}

function warn(parent, title, lines) {
  const list = el('ul', { class: 'rs-warn' });
  for (const line of lines) list.appendChild(el('li', { text: line }));
  parent.appendChild(el('section', { class: 'rs-section' }, [el('h3', { text: title }), list]));
}
