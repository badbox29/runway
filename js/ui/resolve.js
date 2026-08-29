/**
 * The resolution dialog.
 *
 * Shown only when a sprint move has consequences. A plain move never opens
 * anything — asking permission for a decision with no side effects trains
 * people to dismiss the dialog without reading it, which is exactly the habit
 * that makes it useless on the day it matters.
 */
import { planMove, applyPlan, acceptAll, acceptNone } from '../core/relations.js';
import { el, $, clear } from '../util/dom.js';

const REASON = {
  depends: 'needed first',
  blocks: 'blocking this',
  waiting: 'waiting on this',
  bundle: 'do together',
  either: 'can’t have both',
};

let host;

export function initResolve() {
  host = $('#modal');
  host.addEventListener('click', (e) => { if (e.target === host) close(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !host.hidden) close();
  });
}

function close() {
  host.hidden = true;
  clear(host);
}

/**
 * Move a task into a sprint, or back to the backlog, taking its connections
 * into account. This is the only entry point the views should use.
 */
export function requestMove(itemId, sprintId, status = 'todo') {
  const plan = planMove(itemId, sprintId);
  if (!plan) return;
  if (!plan.needsAttention) { applyPlan(plan, { ...acceptNone(), status }); return; }
  open(plan, status);
}

function open(plan, status) {
  clear(host);
  host.hidden = false;

  const chosen = acceptAll(plan);
  const box = el('div', { class: 'rs-box', role: 'dialog', 'aria-modal': 'true' });

  const returning = plan.kind === 'return';
  box.appendChild(el('header', { class: 'rs-head' }, [
    el('h2', {
      text: returning ? 'Send back to the backlog?' : `Commit to ${plan.sprint ? plan.sprint.name : 'this sprint'}?`,
    }),
    el('p', { class: 'rs-sub', text: plan.subject.item.title }),
  ]));

  const body = el('div', { class: 'rs-body' });

  if (returning) {
    section(body, 'Left without a prerequisite',
      'These are still committed and would have nothing to start from.',
      plan.strand, chosen.strand, 'strand');
  } else {
    section(body, 'Comes along',
      'This task can’t be honestly committed to without them.',
      plan.pull, chosen.pull, 'pull');
    section(body, 'Has to leave',
      'An either/or partner is already in this sprint. Keeping both would commit you to a choice you said you hadn’t made.',
      plan.evict, chosen.evict, 'evict');
  }

  if (plan.contradictions.length) {
    const list = el('ul', { class: 'rs-warn' });
    for (const c of plan.contradictions) {
      list.appendChild(el('li', { text: `${c.a.title} and ${c.b.title} are an either/or, but both are being pulled in. You'll need to drop one.` }));
    }
    body.appendChild(note('Can’t resolve this one', list));
  }

  if (plan.clashes.length) {
    const list = el('ul', { class: 'rs-warn' });
    for (const c of plan.clashes) {
      list.appendChild(el('li', {
        text: `${c.against.title} conflicts with ${c.item.title}${c.sameDay ? ' — same day' : ''}.`,
      }));
    }
    body.appendChild(note('Worth knowing', list));
  }

  if (plan.offWindow.length) {
    const list = el('ul', { class: 'rs-warn' });
    for (const c of plan.offWindow) {
      list.appendChild(el('li', { text: `${c.item.title} is dated ${c.item.date}, outside this sprint.` }));
    }
    body.appendChild(note('Dated outside the window', list));
  }

  box.appendChild(body);

  const primary = el('button', { class: 'tool on', text: returning ? 'Send all back' : 'Commit all' });
  primary.addEventListener('click', () => { applyPlan(plan, { ...chosen, status }); close(); });

  const solo = el('button', { class: 'tool', text: 'Just this one' });
  solo.addEventListener('click', () => { applyPlan(plan, { ...acceptNone(), status }); close(); });

  const cancel = el('button', { class: 'tool', text: 'Cancel' });
  cancel.addEventListener('click', close);

  box.appendChild(el('footer', { class: 'rs-foot' }, [cancel, el('span', { class: 'spacer' }), solo, primary]));
  host.appendChild(box);
  primary.focus();
}

function section(parent, title, blurb, entries, chosenSet, kind) {
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

const note = (title, list) =>
  el('section', { class: 'rs-section' }, [el('h3', { text: title }), list]);
