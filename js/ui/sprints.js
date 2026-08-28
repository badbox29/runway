/**
 * Sprints — a light personal agile tracker.
 *
 * Two ideas hold this together with the rest of Runway:
 *
 * 1. A task has a bucket *and* a sprint. The bucket is which part of your life
 *    it belongs to and never changes when the fortnight does; the sprint is a
 *    time box. They are orthogonal, so a card keeps its bucket colour and
 *    texture wherever it lands on the board.
 *
 * 2. Dependencies you drew on the canvas surface here. A card whose
 *    prerequisites aren't done gets a warning dot, which is the payoff for
 *    having typed connections at all — otherwise the graph is decoration.
 */
import {
  state, backlogItems, sprintItems, getSprint, blockersFor, progressOf, daysUntil,
  assignToSprint, addSprint, startSprint, completeSprint, removeSprint, updateSprint,
  cyclePoints, addItem, emit, STATUSES,
} from '../core/store.js';
import { fillCSS } from '../util/patterns.js';
import { longDate } from '../util/dates.js';
import { el, $, clear } from '../util/dom.js';
import { openItemMenu } from './popover.js';

const LANES = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

let root;
let drag = null;

export function initSprints() {
  root = $('#sprints');
  bindDragging();
}

/* ------------------------------------------------------------- render */

export function renderSprints() {
  if (!root || root.hidden) return;
  clear(root);
  const wrap = el('div', { class: 'sp-wrap' });
  wrap.appendChild(header());
  wrap.appendChild(body());
  root.appendChild(wrap);
}

function header() {
  const head = el('div', { class: 'sp-head' });
  const sprint = getSprint(state.currentSprint);

  const picker = el('select', { class: 'sp-pick', 'aria-label': 'Sprint' });
  for (const s of state.sprints) {
    picker.appendChild(el('option', { value: s.id, text: s.name, ...(s.id === state.currentSprint ? { selected: 'selected' } : {}) }));
  }
  if (!state.sprints.length) picker.appendChild(el('option', { text: 'No sprints yet' }));
  picker.addEventListener('change', () => { state.currentSprint = picker.value; emit('view'); });

  const title = el('div', { class: 'sp-title' }, [
    el('h2', { text: sprint ? sprint.name : 'Backlog' }),
    sprint ? el('span', { class: `sp-state ${sprint.status}`, text: sprint.status }) : null,
    el('span', { class: 'spacer' }),
    state.sprints.length ? picker : null,
    button('New sprint', createSprint),
    sprint && sprint.status === 'planned' ? button('Start', () => startSprint(sprint.id)) : null,
    sprint && sprint.status === 'active' ? button('Complete', () => finish(sprint)) : null,
    sprint ? button('Delete', () => {
      if (confirm(`Delete “${sprint.name}”? Its tasks return to the backlog.`)) removeSprint(sprint.id);
    }) : null,
  ]);
  head.appendChild(title);

  if (sprint) {
    const left = daysUntil(sprint.end);
    const when = [
      sprint.start ? longDate(sprint.start) : null,
      sprint.end ? longDate(sprint.end) : null,
    ].filter(Boolean).join(' – ');
    const remaining = left === null ? ''
      : left > 1 ? `${left} days left`
        : left === 1 ? '1 day left'
          : left === 0 ? 'ends today'
            : `${Math.abs(left)} days over`;
    head.appendChild(el('div', { class: 'sp-when', text: [when, remaining].filter(Boolean).join(' · ') }));

    const entries = sprintItems(sprint.id);
    const p = progressOf(entries);
    const meter = el('div', { class: 'sp-meter' }, [
      el('div', { class: 'sp-track' }, [el('div', { class: 'sp-fill', style: `width:${p.pct}%` })]),
      el('div', { class: 'sp-stats' }, [
        stat(`${p.done}/${p.total}`, 'tasks done'),
        stat(`${p.donePoints}/${p.points}`, 'points'),
        stat(`${p.pct}%`, 'complete'),
      ]),
    ]);
    head.appendChild(meter);
  } else {
    head.appendChild(el('div', {
      class: 'sp-when',
      text: 'Everything below is unplanned. Make a sprint to commit some of it to a fortnight.',
    }));
  }
  return head;
}

const stat = (value, label) =>
  el('span', {}, [el('b', { text: value }), document.createTextNode(` ${label}`)]);

function button(label, onClick) {
  const b = el('button', { class: 'tool', text: label });
  b.addEventListener('click', onClick);
  return b;
}

function body() {
  const sprint = getSprint(state.currentSprint);
  const grid = el('div', { class: 'sp-body' });

  /* backlog */
  const backlog = backlogItems();
  const bl = lane('backlog', 'Backlog', backlog.length);
  const stack = $('.sp-stack', bl);
  if (!backlog.length) stack.appendChild(el('div', { class: 'sp-empty', text: 'Nothing waiting.' }));
  else for (const entry of backlog) stack.appendChild(card(entry));
  bl.appendChild(newItemRow());
  grid.appendChild(bl);

  /* sprint lanes */
  const lanes = el('div', { class: 'sp-lanes' });
  if (!sprint) {
    lanes.appendChild(el('div', { class: 'sp-lane' }, [
      el('div', { class: 'sp-stack' }, [
        el('div', { class: 'sp-empty', text: 'No sprint selected. Create one to start pulling work across.' }),
      ]),
    ]));
  } else {
    const entries = sprintItems(sprint.id);
    for (const l of LANES) {
      const inLane = entries.filter(({ item }) => item.status === l.id);
      const node = lane(`lane:${l.id}`, l.label, inLane.length);
      const s = $('.sp-stack', node);
      if (!inLane.length) s.appendChild(el('div', { class: 'sp-empty', text: '—' }));
      else for (const entry of inLane) s.appendChild(card(entry));
      lanes.appendChild(node);
    }
  }
  grid.appendChild(lanes);
  return grid;
}

function lane(dropId, label, count) {
  return el('div', { class: 'sp-lane', dataset: { drop: dropId } }, [
    el('header', {}, [
      el('h3', { text: label }),
      el('span', { class: 'n', text: String(count) }),
    ]),
    el('div', { class: 'sp-stack' }),
  ]);
}

function card({ item, bucket }) {
  const blockers = blockersFor(item.id);

  const grip = el('div', {
    class: 'sp-grip',
    style: fillCSS(bucket.color, bucket.pattern, 1),
    title: 'Drag to move',
  });
  grip.addEventListener('pointerdown', (e) => startDrag(e, item, node));

  const points = el('button', {
    class: `sp-points${item.points ? ' set' : ''}`,
    text: item.points ? String(item.points) : '–',
    title: 'Estimate',
  });
  points.addEventListener('click', (e) => { e.stopPropagation(); cyclePoints(item.id); });

  const node = el('div', {
    class: `sp-card${item.status === 'done' ? ' done' : ''}`,
    style: `border-left-color:${bucket.color}`,
    dataset: { item: item.id },
  }, [
    grip,
    el('div', { class: 'sp-text', text: item.title }),
    el('div', { class: 'sp-meta' }, [
      blockers.length
        ? el('span', {
          class: 'sp-block',
          title: `Waiting on: ${blockers.map((b) => b.item.title).join(', ')}`,
        })
        : null,
      el('span', { class: 'sp-where', text: bucket.name }),
      points,
    ]),
  ]);

  node.addEventListener('click', (e) => {
    if (e.target === points || e.target === grip) return;
    openItemMenu(e.clientX, e.clientY, item, bucket);
  });
  return node;
}

function newItemRow() {
  const input = el('input', { type: 'text', placeholder: 'Add to backlog' });
  const pick = el('select', { 'aria-label': 'Bucket' });
  for (const b of state.buckets) pick.appendChild(el('option', { value: b.id, text: b.name }));

  const submit = () => {
    const title = input.value.trim();
    if (!title || !pick.value) return;
    addItem(pick.value, title);
    input.value = '';
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return el('div', { class: 'sp-new' }, [input, pick]);
}

/* ------------------------------------------------------------ actions */

function createSprint() {
  const name = prompt('Sprint name', `Sprint ${state.sprints.length + 1}`);
  if (!name || !name.trim()) return;
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 13);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  addSprint({ name: name.trim(), start: iso(start), end: iso(end) });
}

function finish(sprint) {
  const returned = completeSprint(sprint.id);
  if (returned) {
    alert(`${sprint.name} closed. ${returned} unfinished ${returned === 1 ? 'task' : 'tasks'} went back to the backlog.`);
  }
}

/* --------------------------------------------------------------- drag */

function startDrag(e, item, node) {
  e.preventDefault();
  e.stopPropagation();
  drag = { item, node, x: e.clientX, y: e.clientY, over: null, ghost: null };
  node.classList.add('dragging');
}

function bindDragging() {
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;

    if (!drag.ghost) {
      drag.ghost = el('div', {
        class: 'sp-card',
        style: 'position:fixed;z-index:60;pointer-events:none;max-width:260px;'
          + 'box-shadow:0 10px 24px var(--shadow);border-color:var(--ink);',
        text: drag.item.title,
      });
      document.body.appendChild(drag.ghost);
    }
    drag.ghost.style.left = `${e.clientX - 14}px`;
    drag.ghost.style.top = `${e.clientY - 14}px`;

    const under = document.elementFromPoint(e.clientX, e.clientY);
    const zone = under && under.closest ? under.closest('[data-drop]') : null;
    document.querySelectorAll('.sp-lane.hot').forEach((n) => n.classList.remove('hot'));
    drag.over = zone ? zone.dataset.drop : null;
    if (zone) zone.classList.add('hot');
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.node.classList.remove('dragging');
    if (d.ghost) d.ghost.remove();
    document.querySelectorAll('.sp-lane.hot').forEach((n) => n.classList.remove('hot'));
    if (!d.over) return;

    if (d.over === 'backlog') { assignToSprint(d.item.id, null); return; }
    const [, status] = d.over.split(':');
    if (STATUSES.includes(status) && state.currentSprint) {
      assignToSprint(d.item.id, state.currentSprint, status);
    }
  });
}

export { updateSprint };
