/**
 * The task detail panel.
 *
 * This replaces what used to be a floating item menu. That menu grew until it
 * was taller than the screen, and being fixed to the click point it would open
 * half off the bottom with no way to scroll it back — which is what a popover
 * does when you ask it to hold a form.
 *
 * A docked panel with its own scroll fixes that by construction: it is always
 * fully on screen, it can be as long as it needs to be, and it can stay open
 * while you work in the view behind it. It is also the one place where a task's
 * connections are editable regardless of which view you came from, which is
 * what keeps the canvas and the sprint board describing the same world.
 */
import {
  state, getItem, getBucket, getSprint, updateItem, removeItem, moveItem,
  addComment, removeComment, updateEdge, removeEdge, addEdge, allItems,
  dateFitsSprint, isDropped, dropItem, POINT_SCALE, STATUSES,
} from '../core/store.js';
import { edgesFor, exclusiveGroup } from '../core/relations.js';
import { TYPES, typeOf } from '../config/types.js';
import { requestMove, requestStatus, requestRestore } from './resolve.js';
import { fillCSS, adapt } from '../util/patterns.js';
import { longDate } from '../util/dates.js';
import { el, $, clear } from '../util/dom.js';

const STATUS_LABEL = { todo: 'To do', doing: 'In progress', done: 'Done' };

let root;
let openId = null;

export function initDetail() {
  root = $('#detail');
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden && !$('#modal', document).hidden === false) closeDetail();
  });
}

export const isDetailOpen = () => openId !== null;

export function openDetail(itemId) {
  openId = itemId;
  renderDetail();
}

export function closeDetail() {
  openId = null;
  root.hidden = true;
  clear(root);
  document.body.classList.remove('has-detail');
}

/** Repaint if the open task changed underneath us; close if it was deleted. */
export function renderDetail() {
  if (!root) return;
  if (!openId) { root.hidden = true; return; }
  const found = getItem(openId);
  if (!found) { closeDetail(); return; }

  const scrolled = root.scrollTop;
  clear(root);
  root.hidden = false;
  document.body.classList.add('has-detail');

  const { item, bucket } = found;
  root.appendChild(head(item, bucket));
  root.appendChild(fields(item, bucket));
  root.appendChild(connections(item));
  root.appendChild(comments(item));
  root.scrollTop = scrolled;
}

/* --------------------------------------------------------------- head */

function head(item, bucket) {
  const close = el('button', { class: 'dt-close', text: '×', title: 'Close (Esc)' });
  close.addEventListener('click', closeDetail);

  const title = el('textarea', { class: 'dt-title', rows: '2', spellcheck: 'false' });
  title.value = item.title;
  title.addEventListener('change', () => {
    const next = title.value.trim();
    if (next && next !== item.title) updateItem(item.id, { title: next });
  });

  return el('header', { class: 'dt-head' }, [
    el('div', { class: 'dt-crumb' }, [
      el('span', { class: 'dt-swatch', style: fillCSS(bucket.color, bucket.pattern, 1) }),
      el('span', { text: bucket.name }),
      el('span', { class: 'spacer' }),
      close,
    ]),
    title,
  ]);
}

/* ------------------------------------------------------------- fields */

function fields(item, bucket) {
  const box = el('section', { class: 'dt-section' });

  /* status */
  /* Dropped is a state, not a lane. Showing it as a fourth button would invite
     dropping something by mis-click; it gets its own action below instead. */
  if (isDropped(item)) {
    const winner = exclusiveGroup(item.id).find((r) => !isDropped(r.item));
    box.appendChild(el('div', { class: 'dt-dropped' }, [
      el('strong', { text: 'Dropped.' }),
      document.createTextNode(winner
        ? ` You picked ${winner.item.title} instead. Everything here is kept.`
        : ' Kept on record, out of the backlog.'),
    ]));
    const back = el('button', { class: 'dt-restore', text: 'Restore this task' });
    back.addEventListener('click', () => requestRestore(item.id));
    box.appendChild(back);
  }

  const status = el('div', { class: 'dt-seg' });
  for (const s of STATUSES) {
    const b = el('button', {
      class: `dt-segbtn${item.status === s ? ' on' : ''}`, text: STATUS_LABEL[s],
    });
    /* Finishing can settle an oxygen choice, so it routes through the planner
       rather than writing the field directly. */
    b.addEventListener('click', () => requestStatus(item.id, s));
    status.appendChild(b);
  }
  box.appendChild(row('Status', status));

  /* sprint — routed through the planner, not set directly */
  const sprint = el('select', { class: 'dt-input' });
  sprint.appendChild(el('option', { value: '', text: 'Backlog' }));
  for (const s of state.sprints) {
    sprint.appendChild(el('option', {
      value: s.id, text: `${s.name} · ${s.status}`,
      ...(item.sprintId === s.id ? { selected: 'selected' } : {}),
    }));
  }
  sprint.addEventListener('change', () => {
    requestMove(item.id, sprint.value || null, item.status === 'done' ? 'done' : 'todo');
  });
  box.appendChild(row('Sprint', sprint));

  /* date, with a note when it disagrees with the sprint it sits in */
  const date = el('input', { class: 'dt-input', type: 'date', value: item.date || '' });
  date.addEventListener('change', () => updateItem(item.id, { date: date.value || null }));
  box.appendChild(row('Date', date));

  const inSprint = getSprint(item.sprintId);
  if (inSprint && !dateFitsSprint(item, inSprint)) {
    box.appendChild(el('p', {
      class: 'dt-flag',
      text: `Dated ${longDate(item.date)}, outside ${inSprint.name}. The date is when it happens; the sprint is when you promised to deal with it — worth making them agree.`,
    }));
  }

  /* points */
  const points = el('div', { class: 'dt-chips' });
  for (const value of [null, ...POINT_SCALE]) {
    const b = el('button', {
      class: `dt-chip${item.points === value ? ' on' : ''}`,
      text: value === null ? '–' : String(value),
    });
    b.addEventListener('click', () => updateItem(item.id, { points: value }));
    points.appendChild(b);
  }
  box.appendChild(row('Points', points));

  /* bucket */
  const pick = el('select', { class: 'dt-input' });
  for (const b of state.buckets) {
    pick.appendChild(el('option', {
      value: b.id, text: b.name, ...(b.id === bucket.id ? { selected: 'selected' } : {}),
    }));
  }
  pick.addEventListener('change', () => moveItem(item.id, pick.value));
  box.appendChild(row('Bucket', pick));

  const actions = el('div', { class: 'dt-actions' });
  if (!isDropped(item)) {
    const drop = el('button', { class: 'dt-danger', text: 'Drop' });
    drop.addEventListener('click', () => dropItem(item.id));
    actions.appendChild(drop);
  }
  const del = el('button', { class: 'dt-danger', text: 'Delete task' });
  del.addEventListener('click', () => {
    if (confirm(`Delete “${item.title}”? Dropping keeps it on record instead.`)) {
      removeItem(item.id);
      closeDetail();
    }
  });
  actions.appendChild(del);
  box.appendChild(actions);
  return box;
}

const row = (label, control) =>
  el('div', { class: 'dt-row' }, [el('span', { class: 'dt-label', text: label }), control]);

/* -------------------------------------------------------- connections */

/**
 * Connections, editable here as well as on the canvas.
 *
 * Direction matters for some types and not others, so the wording changes with
 * the type rather than always reading left-to-right: "needs X" and "either this
 * or X" describe genuinely different shapes and shouldn't look alike.
 */
function connections(item) {
  const box = el('section', { class: 'dt-section' }, [el('h3', { text: 'Connections' })]);
  const mine = edgesFor(item.id);

  if (!mine.length) {
    box.appendChild(el('p', { class: 'dt-quiet', text: 'None yet.' }));
  }

  for (const edge of mine) {
    const outgoing = edge.from.kind === 'item' && edge.from.id === item.id;
    const otherEp = outgoing ? edge.to : edge.from;
    const other = otherEp.kind === 'item' ? getItem(otherEp.id) : null;
    const otherName = other ? other.item.title
      : (getBucket(otherEp.id)?.name || 'unknown');
    const t = typeOf(edge.type);

    const pick = el('select', { class: 'dt-input dt-type' });
    for (const [key, def] of Object.entries(TYPES)) {
      pick.appendChild(el('option', {
        value: key, text: def.label, ...(key === edge.type ? { selected: 'selected' } : {}),
      }));
    }
    pick.addEventListener('change', () => updateEdge(edge.id, { type: pick.value }));

    const flip = t.directed
      ? el('button', { class: 'dt-mini', text: '⇄', title: 'Reverse direction' })
      : null;
    if (flip) flip.addEventListener('click', () => updateEdge(edge.id, { from: edge.to, to: edge.from }));

    const cut = el('button', { class: 'dt-mini', text: '×', title: 'Cut connection' });
    cut.addEventListener('click', () => removeEdge(edge.id));

    const unresolved = other && other.item.status !== 'done'
      && ['depends', 'blocks', 'waiting'].includes(edge.type) && outgoing;
    const rivalDropped = other && edge.type === 'either' && isDropped(other.item);

    box.appendChild(el('div', { class: `dt-conn${unresolved ? ' unresolved' : ''}` }, [
      el('span', { class: 'dt-line', style: `border-top-color:${adapt(t.color)};border-top-style:${t.dash ? 'dashed' : 'solid'}` }),
      el('div', { class: 'dt-conn-body' }, [
        pick,
        el('span', {
          class: 'dt-conn-other',
          text: `${t.directed ? (outgoing ? '→' : '←') : '↔'} ${otherName}`
            + (rivalDropped ? ' · dropped' : ''),
        }),
      ]),
      flip,
      cut,
    ]));
  }

  box.appendChild(addConnection(item));
  return box;
}

function addConnection(item) {
  const type = el('select', { class: 'dt-input' });
  for (const [key, def] of Object.entries(TYPES)) {
    type.appendChild(el('option', { value: key, text: def.label }));
  }

  const target = el('select', { class: 'dt-input' });
  target.appendChild(el('option', { value: '', text: 'Pick a task…' }));
  const byBucket = new Map();
  for (const entry of allItems()) {
    if (entry.item.id === item.id) continue;
    if (!byBucket.has(entry.bucket.id)) byBucket.set(entry.bucket.id, []);
    byBucket.get(entry.bucket.id).push(entry);
  }
  for (const [bucketId, entries] of byBucket) {
    const group = el('optgroup', { label: getBucket(bucketId).name });
    for (const e of entries) group.appendChild(el('option', { value: e.item.id, text: e.item.title }));
    target.appendChild(group);
  }

  const add = el('button', { class: 'dt-mini wide', text: 'Connect' });
  add.addEventListener('click', () => {
    if (!target.value) return;
    addEdge(type.value, { kind: 'item', id: item.id }, { kind: 'item', id: target.value });
    target.value = '';
  });

  return el('div', { class: 'dt-add' }, [type, target, add]);
}

/* ------------------------------------------------------------ comments */

function comments(item) {
  const box = el('section', { class: 'dt-section' }, [el('h3', { text: 'Notes' })]);

  const notes = el('textarea', {
    class: 'dt-notes', rows: '3', placeholder: 'Working notes — what this actually involves',
  });
  notes.value = item.notes || '';
  notes.addEventListener('change', () => updateItem(item.id, { notes: notes.value }));
  box.appendChild(notes);

  box.appendChild(el('h3', { text: 'Comments' }));
  const list = item.comments || [];
  if (!list.length) box.appendChild(el('p', { class: 'dt-quiet', text: 'No comments yet.' }));

  for (const c of list) {
    const del = el('button', { class: 'dt-mini', text: '×', title: 'Delete comment' });
    del.addEventListener('click', () => removeComment(item.id, c.id));
    box.appendChild(el('div', { class: 'dt-comment' }, [
      el('div', { class: 'dt-comment-head' }, [
        el('span', { class: 'dt-when', text: stamp(c.at) }),
        el('span', { class: 'spacer' }),
        del,
      ]),
      el('p', { class: 'dt-comment-text', text: c.text }),
    ]));
  }

  const draft = el('textarea', { class: 'dt-notes', rows: '2', placeholder: 'Add a comment' });
  const post = el('button', { class: 'dt-mini wide', text: 'Comment' });
  const submit = () => {
    if (!draft.value.trim()) return;
    addComment(item.id, draft.value);
    draft.value = '';
  };
  post.addEventListener('click', submit);
  draft.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  });
  box.appendChild(el('div', { class: 'dt-post' }, [draft, post]));
  return box;
}

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}
