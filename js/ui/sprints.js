/**
 * Sprints — a light personal agile tracker.
 *
 * Layout follows the shape Jira settled on: the sprint sits at the top as a set
 * of lanes, and the backlog runs full width beneath it as a dense list of rows.
 * That split reflects how the two are actually used — the sprint is a board you
 * work *on*, the backlog is an inventory you scan *down*. Cards in lanes and
 * rows in a list are the right shapes for those two different jobs.
 *
 * Two ideas tie this to the rest of Runway:
 *
 * 1. A task has a bucket *and* a sprint. The bucket is which part of your life
 *    it belongs to and never changes when the fortnight does; the sprint is a
 *    time box. They are orthogonal, so a task keeps its bucket colour and
 *    texture wherever it lands.
 *
 * 2. Dependencies drawn on the canvas surface here. A task whose prerequisites
 *    aren't done gets a warning dot, which is the payoff for having typed
 *    connections at all — otherwise the graph is decoration.
 */
import {
  state, backlogItems, sprintItems, getSprint, blockersFor, progressOf, daysUntil,
  assignToSprint, addSprint, startSprint, completeSprint, removeSprint,
  cyclePoints, addItem, emit, STATUSES,
} from '../core/store.js';
import { fillCSS } from '../util/patterns.js';
import { longDate, shortDate } from '../util/dates.js';
import { el, $, $$, clear } from '../util/dom.js';
import { openItemMenu } from './popover.js';

const LANES = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

/**
 * View state, deliberately not in the store: how you filtered your backlog this
 * minute is not part of the board, and persisting it would mean opening Runway
 * tomorrow to a list that is mysteriously missing half its rows.
 */
const view = { open: true, text: '', bucket: 'all', hideDone: true };

let root;
let drag = null;

export function initSprints() {
  root = $('#sprints');
  bindDragging();
}

/* ------------------------------------------------------------- render */

export function renderSprints() {
  if (!root || root.hidden) return;
  const scrolled = root.scrollTop;
  clear(root);
  const wrap = el('div', { class: 'sp-wrap' });
  wrap.appendChild(header());
  wrap.appendChild(lanes());
  wrap.appendChild(backlog());
  root.appendChild(wrap);
  /* Repainting from the top would throw you back to the sprint header every
     time a checkbox changed. The backlog is long; keep the reader where they
     were. */
  root.scrollTop = scrolled;
}

/* -------------------------------------------------------- sprint head */

function header() {
  const head = el('div', { class: 'sp-head' });
  const sprint = getSprint(state.currentSprint);

  const picker = el('select', { class: 'sp-pick', 'aria-label': 'Sprint' });
  for (const s of state.sprints) {
    picker.appendChild(el('option', {
      value: s.id, text: s.name, ...(s.id === state.currentSprint ? { selected: 'selected' } : {}),
    }));
  }
  if (!state.sprints.length) picker.appendChild(el('option', { text: 'No sprints yet' }));
  picker.addEventListener('change', () => { state.currentSprint = picker.value; emit('view'); });

  head.appendChild(el('div', { class: 'sp-title' }, [
    el('h2', { text: sprint ? sprint.name : 'No sprint' }),
    sprint ? el('span', { class: `sp-state ${sprint.status}`, text: sprint.status }) : null,
    el('span', { class: 'spacer' }),
    state.sprints.length ? picker : null,
    button('New sprint', createSprint),
    sprint && sprint.status === 'planned' ? button('Start', () => startSprint(sprint.id)) : null,
    sprint && sprint.status === 'active' ? button('Complete', () => finish(sprint)) : null,
    sprint ? button('Delete', () => {
      if (confirm(`Delete “${sprint.name}”? Its tasks return to the backlog.`)) removeSprint(sprint.id);
    }) : null,
  ]));

  if (!sprint) {
    head.appendChild(el('div', {
      class: 'sp-when',
      text: 'Nothing is committed. Make a sprint, then pull work up from the backlog.',
    }));
    return head;
  }

  const left = daysUntil(sprint.end);
  const when = [sprint.start && longDate(sprint.start), sprint.end && longDate(sprint.end)]
    .filter(Boolean).join(' – ');
  const remaining = left === null ? ''
    : left > 1 ? `${left} days left`
      : left === 1 ? '1 day left'
        : left === 0 ? 'ends today'
          : `${Math.abs(left)} days over`;
  head.appendChild(el('div', { class: 'sp-when', text: [when, remaining].filter(Boolean).join(' · ') }));

  const p = progressOf(sprintItems(sprint.id));
  head.appendChild(el('div', { class: 'sp-meter' }, [
    el('div', { class: 'sp-track' }, [el('div', { class: 'sp-fill', style: `width:${p.pct}%` })]),
    el('div', { class: 'sp-stats' }, [
      stat(`${p.done}/${p.total}`, 'tasks done'),
      stat(`${p.donePoints}/${p.points}`, 'points'),
      stat(`${p.pct}%`, 'complete'),
    ]),
  ]));
  return head;
}

const stat = (value, label) =>
  el('span', {}, [el('b', { text: value }), document.createTextNode(` ${label}`)]);

function button(label, onClick) {
  const b = el('button', { class: 'tool', text: label });
  b.addEventListener('click', onClick);
  return b;
}

/* ------------------------------------------------------------- lanes */

function lanes() {
  const sprint = getSprint(state.currentSprint);
  const row = el('div', { class: 'sp-lanes' });

  if (!sprint) {
    row.appendChild(el('div', { class: 'sp-lane sp-lane-empty' }, [
      el('div', { class: 'sp-stack' }, [el('div', { class: 'sp-empty', text: 'No sprint selected.' })]),
    ]));
    return row;
  }

  const entries = sprintItems(sprint.id);
  for (const l of LANES) {
    const inLane = entries.filter(({ item }) => item.status === l.id);
    const p = progressOf(inLane);
    const node = el('div', { class: 'sp-lane', dataset: { drop: `lane:${l.id}` } }, [
      el('header', {}, [
        el('h3', { text: l.label }),
        el('span', {
          class: 'n',
          text: p.points ? `${inLane.length} · ${p.points} pt` : String(inLane.length),
        }),
      ]),
      el('div', { class: 'sp-stack' }),
    ]);
    const stack = $('.sp-stack', node);
    if (!inLane.length) stack.appendChild(el('div', { class: 'sp-empty', text: '—' }));
    else for (const entry of inLane) stack.appendChild(card(entry));
    row.appendChild(node);
  }
  return row;
}

function card({ item, bucket }) {
  const grip = el('div', {
    class: 'sp-grip', style: fillCSS(bucket.color, bucket.pattern, 1), title: 'Drag to move',
  });
  const points = pointsChip(item);

  const node = el('div', {
    class: `sp-card${item.status === 'done' ? ' done' : ''}`,
    style: `border-left-color:${bucket.color}`,
    dataset: { item: item.id },
  }, [
    grip,
    el('div', { class: 'sp-text', text: item.title }),
    el('div', { class: 'sp-meta' }, [
      blockerDot(blockersFor(item.id)),
      el('span', { class: 'sp-where', text: bucket.name }),
      points,
    ]),
  ]);

  grip.addEventListener('pointerdown', (e) => startDrag(e, item, node));
  node.addEventListener('click', (e) => {
    if (e.target === points || e.target === grip) return;
    openItemMenu(e.clientX, e.clientY, item, bucket);
  });
  return node;
}

function pointsChip(item) {
  const chip = el('button', {
    class: `sp-points${item.points ? ' set' : ''}`,
    text: item.points ? String(item.points) : '–',
    title: 'Estimate',
  });
  chip.addEventListener('click', (e) => { e.stopPropagation(); cyclePoints(item.id); });
  return chip;
}

const blockerDot = (blockers) => (blockers.length
  ? el('span', {
    class: 'sp-block',
    title: `Waiting on: ${blockers.map((b) => b.item.title).join(', ')}`,
  })
  : null);

/* ----------------------------------------------------------- backlog */

/**
 * The backlog runs full width beneath the sprint, as rows rather than cards.
 *
 * At any real size this list is long — the demo board alone puts 150-odd tasks
 * in it — so it carries its own filter. A wall of rows with no way to narrow it
 * is not an inventory, it's a haystack.
 */
function backlog() {
  const all = backlogItems();
  const shown = applyFilter(all);

  const caret = el('button', {
    class: 'sp-caret',
    text: view.open ? '▾' : '▸',
    'aria-expanded': String(view.open),
    title: view.open ? 'Collapse backlog' : 'Expand backlog',
  });
  caret.addEventListener('click', () => { view.open = !view.open; renderSprints(); });

  const section = el('section', {
    class: `sp-backlog${view.open ? '' : ' closed'}`,
    dataset: { drop: 'backlog' },
  }, [
    el('header', { class: 'sp-bl-head' }, [
      caret,
      el('h3', { text: 'Backlog' }),
      el('span', { class: 'n', text: countLabel(shown.length, all.length) }),
      el('span', { class: 'spacer' }),
      filters(all),
    ]),
  ]);

  if (!view.open) return section;

  const rows = el('div', { class: 'sp-rows' });
  fillRows(rows, shown, all.length);
  section.appendChild(rows);
  section.appendChild(newItemRow());
  return section;
}

const countLabel = (shown, total) => (shown === total ? String(total) : `${shown} of ${total}`);

function applyFilter(entries) {
  const text = view.text.trim().toLowerCase();
  return entries.filter(({ item, bucket }) => {
    if (view.hideDone && item.status === 'done') return false;
    if (view.bucket !== 'all' && bucket.id !== view.bucket) return false;
    if (text && !item.title.toLowerCase().includes(text)) return false;
    return true;
  });
}

/**
 * Filter controls sit outside the rows container and repaint only the rows, so
 * typing in the search box never destroys the input under the cursor.
 */
function filters(all) {
  const search = el('input', {
    class: 'sp-filter', type: 'search', placeholder: 'Filter', value: view.text,
  });
  search.addEventListener('input', () => { view.text = search.value; refreshRows(all); });

  const pick = el('select', { class: 'sp-filter', 'aria-label': 'Filter by bucket' });
  pick.appendChild(el('option', { value: 'all', text: 'All buckets' }));
  for (const b of state.buckets) {
    pick.appendChild(el('option', {
      value: b.id, text: b.name, ...(view.bucket === b.id ? { selected: 'selected' } : {}),
    }));
  }
  pick.addEventListener('change', () => { view.bucket = pick.value; refreshRows(all); });

  const done = el('button', {
    class: `tool${view.hideDone ? '' : ' on'}`,
    text: view.hideDone ? 'Show done' : 'Hide done',
  });
  done.addEventListener('click', () => {
    view.hideDone = !view.hideDone;
    done.textContent = view.hideDone ? 'Show done' : 'Hide done';
    done.classList.toggle('on', !view.hideDone);
    refreshRows(all);
  });

  return el('div', { class: 'sp-filters' }, [search, pick, done]);
}

function refreshRows(all) {
  const rows = $('.sp-rows', root);
  if (!rows) return;
  const shown = applyFilter(all);
  fillRows(rows, shown, all.length);
  const count = $('.sp-bl-head .n', root);
  if (count) count.textContent = countLabel(shown.length, all.length);
}

function fillRows(container, shown, total) {
  clear(container);
  if (!shown.length) {
    container.appendChild(el('div', {
      class: 'sp-empty',
      text: total ? 'Nothing matches that filter.' : 'Backlog is empty.',
    }));
    return;
  }
  for (const entry of shown) container.appendChild(row(entry));
}

function row({ item, bucket }) {
  const sprint = getSprint(state.currentSprint);
  const grip = el('div', {
    class: 'sp-grip', style: fillCSS(bucket.color, bucket.pattern, 1), title: 'Drag to move',
  });
  const points = pointsChip(item);

  /* With the backlog below the fold, dragging a row up into a lane means
     dragging across a scroll. This is the one-click way to do the same thing. */
  const send = sprint && sprint.status !== 'done'
    ? el('button', { class: 'sp-send', text: '↑', title: `Send to ${sprint.name}` })
    : null;
  if (send) {
    send.addEventListener('click', (e) => {
      e.stopPropagation();
      assignToSprint(item.id, sprint.id, 'todo');
    });
  }

  const node = el('div', {
    class: `sp-row${item.status === 'done' ? ' done' : ''}`,
    style: `border-left-color:${bucket.color}`,
    dataset: { item: item.id },
  }, [
    grip,
    el('div', { class: 'sp-text', text: item.title }),
    el('div', { class: 'sp-meta' }, [
      blockerDot(blockersFor(item.id)),
      item.date ? el('span', { class: 'sp-date', text: shortDate(item.date) }) : null,
      el('span', { class: 'sp-where', text: bucket.name }),
      points,
      send,
    ]),
  ]);

  grip.addEventListener('pointerdown', (e) => startDrag(e, item, node));
  node.addEventListener('click', (e) => {
    if (e.target === points || e.target === grip || e.target === send) return;
    openItemMenu(e.clientX, e.clientY, item, bucket);
  });
  return node;
}

function newItemRow() {
  const input = el('input', { type: 'text', placeholder: 'Add to backlog' });
  const pick = el('select', { 'aria-label': 'Bucket' });
  for (const b of state.buckets) pick.appendChild(el('option', { value: b.id, text: b.name }));

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const title = input.value.trim();
    if (!title || !pick.value) return;
    addItem(pick.value, title);
    input.value = '';
  });

  return el('div', { class: 'sp-new' }, [input, pick]);
}

/* ------------------------------------------------------------ actions */

function createSprint() {
  const name = prompt('Sprint name', `Sprint ${state.sprints.length + 1}`);
  if (!name || !name.trim()) return;
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 13);
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
  drag = { item, node, x: e.clientX, y: e.clientY, over: null, ghost: null, frame: null };
  node.classList.add('dragging');
  drag.frame = requestAnimationFrame(tick);
}

/**
 * Edge auto-scroll.
 *
 * Lanes and backlog are stacked now, so a drag between them usually crosses
 * more board than there is screen. Nudging the container while the pointer
 * rests near an edge is what makes that gesture possible at all.
 */
function tick() {
  if (!drag) return;
  const EDGE = 96;
  const SPEED = 18;
  const r = root.getBoundingClientRect();
  let delta = 0;
  if (drag.y < r.top + EDGE) delta = -SPEED * (1 - Math.max(0, drag.y - r.top) / EDGE);
  else if (drag.y > r.bottom - EDGE) delta = SPEED * (1 - Math.max(0, r.bottom - drag.y) / EDGE);

  if (delta) {
    const before = root.scrollTop;
    root.scrollTop += delta;
    if (root.scrollTop !== before) updateHover(drag.x, drag.y);
  }
  drag.frame = requestAnimationFrame(tick);
}

function updateHover(x, y) {
  if (!drag) return;
  const under = document.elementFromPoint(x, y);
  const zone = under && under.closest ? under.closest('[data-drop]') : null;
  $$('.hot').forEach((n) => n.classList.remove('hot'));
  drag.over = zone ? zone.dataset.drop : null;
  if (zone) zone.classList.add('hot');
}

function bindDragging() {
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;

    if (!drag.ghost) {
      drag.ghost = el('div', { class: 'sp-card sp-ghost', text: drag.item.title });
      document.body.appendChild(drag.ghost);
    }
    drag.ghost.style.left = `${e.clientX - 14}px`;
    drag.ghost.style.top = `${e.clientY - 14}px`;
    updateHover(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.frame);
    d.node.classList.remove('dragging');
    if (d.ghost) d.ghost.remove();
    $$('.hot').forEach((n) => n.classList.remove('hot'));
    if (!d.over) return;

    if (d.over === 'backlog') { assignToSprint(d.item.id, null); return; }
    const [, status] = d.over.split(':');
    if (STATUSES.includes(status) && state.currentSprint) {
      assignToSprint(d.item.id, state.currentSprint, status);
    }
  });
}
