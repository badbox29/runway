/**
 * Bucket cards: rendering, header drag, item drag between buckets.
 *
 * Cards are rebuilt wholesale on 'structure' changes. During a drag only the
 * moving element's inline position is touched, so a drag costs one style write
 * and one edge re-route per frame regardless of how many cards exist.
 */
import {
  state, commit, emit, moveItem, addItem, updateItem, removeItem, removeBucket,
  isCommitted, activeSprint, blockersFor,
} from '../core/store.js';
import { openDetail } from './detail.js';
import { fillCSS } from '../util/patterns.js';
import { shortDate } from '../util/dates.js';
import { el, $, $$, clear } from '../util/dom.js';
import { toWorld, growToFit } from './canvas.js';
import { renderEdges } from './edges.js';
import { startWire } from './wiring.js';
import { openBucketMenu } from './popover.js';

let layer;

export function initBuckets() {
  layer = $('#layer-nodes');
  bindDragging();
}

export function renderBuckets() {
  const labels = $$('.edgelabel', layer);
  clear(layer);
  for (const b of state.buckets) layer.appendChild(cardFor(b));
  for (const l of labels) layer.appendChild(l);
}

function cardFor(b) {
  const card = el('div', {
    class: 'bucket',
    dataset: { node: `bucket:${b.id}`, id: b.id },
    style: `left:${b.x}px;top:${b.y}px;width:${b.w}px`,
  });

  card.appendChild(el('div', {
    class: 'strip',
    style: fillCSS(b.color, b.pattern, 1.6),
  }));

  const knob = el('div', { class: 'knob', title: 'Drag to connect' });
  knob.addEventListener('pointerdown', (e) => startWire(e, { kind: 'bucket', id: b.id }));

  const head = el('div', { class: 'head' }, [
    el('div', { class: 'name', style: `color:${b.color}`, text: b.name }),
    el('div', { class: 'count', text: String(b.items.length) }),
    knob,
  ]);
  head.addEventListener('pointerdown', (e) => {
    if (e.target === knob) return;
    startBucketDrag(e, b, card);
  });
  head.addEventListener('dblclick', () => {
    commit();
    b.collapsed = !b.collapsed;
    emit('structure');
  });
  head.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openBucketMenu(e.clientX, e.clientY, b);
  });
  card.appendChild(head);

  if (!b.collapsed) {
    b.items.forEach((item) => card.appendChild(rowFor(b, item)));
    const foot = el('div', { class: 'foot', text: '+ item' });
    foot.addEventListener('click', () => {
      const title = prompt('New item');
      if (title && title.trim()) addItem(b.id, title.trim());
    });
    card.appendChild(foot);
  }
  return card;
}

function rowFor(b, item) {
  const knob = el('div', { class: 'knob', title: 'Drag to connect' });
  knob.addEventListener('pointerdown', (e) => startWire(e, { kind: 'item', id: item.id }));

  /* A task committed to the running sprint is marked here too. The canvas is
     where you decide what depends on what; knowing which of those you have
     already signed up for this fortnight is the missing half of that. */
  const committed = isCommitted(item);
  const blocked = blockersFor(item.id).length > 0;

  const row = el('div', {
    class: `row${item.status === 'done' ? ' done' : ''}${committed ? ' committed' : ''}`,
    dataset: { node: `item:${item.id}`, id: item.id },
    title: committed ? `In ${activeSprint().name}` : '',
  }, [
    committed ? el('span', { class: 'rail', title: `In ${activeSprint().name}` }) : null,
    el('div', { class: 'txt', text: item.title }),
    blocked ? el('span', { class: 'row-block', title: 'Has unfinished prerequisites' }) : null,
    el('div', { class: 'when', text: shortDate(item.date) }),
    knob,
  ]);

  row.addEventListener('pointerdown', (e) => {
    if (e.target === knob) return;
    startItemDrag(e, item, row);
  });
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openDetail(item.id);
  });
  return row;
}

/* ---------------------------------------------------------- card drag */

let drag = null;

function startBucketDrag(e, b, card) {
  e.preventDefault();
  const p = toWorld(e.clientX, e.clientY);
  commit();
  drag = { kind: 'bucket', b, card, dx: p.x - b.x, dy: p.y - b.y, moved: false };
  card.classList.add('dragging');
}

function startItemDrag(e, item, row) {
  drag = {
    kind: 'item', item, row, moved: false,
    startX: e.clientX, startY: e.clientY,
  };
}

function bindDragging() {
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;

    if (drag.kind === 'bucket') {
      const p = toWorld(e.clientX, e.clientY);
      drag.b.x = Math.max(0, Math.round(p.x - drag.dx));
      drag.b.y = Math.max(0, Math.round(p.y - drag.dy));
      drag.card.style.left = `${drag.b.x}px`;
      drag.card.style.top = `${drag.b.y}px`;
      drag.moved = true;
      growToFit();
      renderEdges();
      return;
    }

    const far = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6;
    if (!far) return;
    drag.moved = true;
    drag.row.style.opacity = '0.35';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const host = under && under.closest ? under.closest('.bucket') : null;
    $$('.bucket.hot').forEach((n) => n.classList.remove('hot'));
    drag.target = host ? host.dataset.id : null;
    if (host) host.classList.add('hot');
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    $$('.bucket.hot').forEach((n) => n.classList.remove('hot'));

    if (d.kind === 'bucket') {
      d.card.classList.remove('dragging');
      if (d.moved) emit('geometry');
      return;
    }

    d.row.style.opacity = '';
    if (d.moved && d.target) moveItem(d.item.id, d.target);
    else if (!d.moved) openDetail(d.item.id);
  });
}

export { updateItem, removeItem, removeBucket };
