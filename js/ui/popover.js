/**
 * Popovers.
 *
 * One at a time, positioned in screen space, dismissed by any pointer press
 * outside. Every menu is built from the same primitives so a new one is a few
 * lines rather than a new stylesheet.
 */
import { TYPES, typeOf } from '../config/types.js';
import { PALETTE, PATTERNS } from '../config/palette.js';
import {
  state, addEdge, updateEdge, removeEdge, updateItem, removeItem,
  removeBucket, commit, emit, labelFor,
} from '../core/store.js';
import { fillCSS } from '../util/patterns.js';
import { el } from '../util/dom.js';
import { renderEdges } from './edges.js';

export function closeMenus() {
  document.querySelectorAll('.pop').forEach((n) => n.remove());
}

function popAt(x, y, width = 216) {
  closeMenus();
  const pop = el('div', {
    class: 'pop',
    style: `left:${Math.min(x, window.innerWidth - width - 8)}px;top:${Math.min(y, window.innerHeight - 340)}px`,
  });
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(pop);
  return pop;
}

function typeOption(key, active, onPick) {
  const t = TYPES[key];
  const button = el('button', { class: `opt${active ? ' on' : ''}` }, [
    el('span', {
      class: 'swatchline',
      style: `border-top-color:${t.color};border-top-style:${t.dash ? 'dashed' : 'solid'};border-top-width:${Math.min(t.width, 3)}px`,
    }),
    el('span', {}, [
      document.createTextNode(t.label),
      el('span', { class: 'sub', text: t.note }),
    ]),
  ]);
  button.addEventListener('click', onPick);
  return button;
}

/* ------------------------------------------------- new connection */

export function openTypeMenu(x, y, from, to) {
  const pop = popAt(x, y);
  pop.appendChild(el('div', {
    class: 'ph',
    text: `${labelFor(from)} → ${labelFor(to)}`,
  }));
  for (const key of Object.keys(TYPES)) {
    pop.appendChild(typeOption(key, false, () => {
      addEdge(key, from, to);
      closeMenus();
    }));
  }
}

/* ------------------------------------------- existing connection */

export function openEdgeMenu(x, y, id) {
  const edge = state.edges.find((e) => e.id === id);
  if (!edge) return;
  const pop = popAt(x, y);
  pop.appendChild(el('div', { class: 'ph', text: 'Connection' }));

  for (const key of Object.keys(TYPES)) {
    pop.appendChild(typeOption(key, key === edge.type, () => {
      updateEdge(id, { type: key });
      closeMenus();
    }));
  }

  pop.appendChild(el('div', { class: 'sep' }));

  const reroute = el('button', {
    class: 'opt',
    text: edge.behind ? 'Route around buckets' : 'Pass behind buckets',
  });
  reroute.addEventListener('click', () => {
    updateEdge(id, { behind: !edge.behind });
    closeMenus();
  });
  pop.appendChild(reroute);

  if (typeOf(edge.type).directed) {
    const flip = el('button', { class: 'opt', text: 'Reverse direction' });
    flip.addEventListener('click', () => {
      updateEdge(id, { from: edge.to, to: edge.from });
      closeMenus();
    });
    pop.appendChild(flip);
  }

  const cut = el('button', { class: 'opt danger', text: 'Cut connection' });
  cut.addEventListener('click', () => { removeEdge(id); closeMenus(); });
  pop.appendChild(cut);
}

/* -------------------------------------------------------- item */

export function openItemMenu(x, y, item) {
  const pop = popAt(x, y);
  pop.appendChild(el('div', { class: 'ph', text: 'Item' }));

  const title = el('input', { type: 'text', value: item.title });
  title.addEventListener('change', () => updateItem(item.id, { title: title.value.trim() || item.title }));
  pop.appendChild(title);

  const date = el('input', { type: 'date', value: item.date || '' });
  date.addEventListener('change', () => updateItem(item.id, { date: date.value || null }));
  pop.appendChild(date);

  pop.appendChild(el('div', { class: 'sep' }));

  const done = el('button', { class: 'opt', text: item.done ? 'Mark not done' : 'Mark done' });
  done.addEventListener('click', () => {
    updateItem(item.id, { done: !item.done });
    closeMenus();
  });
  pop.appendChild(done);

  const del = el('button', { class: 'opt danger', text: 'Delete item' });
  del.addEventListener('click', () => { removeItem(item.id); closeMenus(); });
  pop.appendChild(del);
}

/* ------------------------------------------------------ bucket */

export function openBucketMenu(x, y, bucket) {
  const pop = popAt(x, y);
  pop.appendChild(el('div', { class: 'ph', text: 'Bucket' }));

  const name = el('input', { type: 'text', value: bucket.name });
  name.addEventListener('change', () => {
    commit();
    bucket.name = name.value.trim() || bucket.name;
    emit('structure');
  });
  pop.appendChild(name);

  const swatches = el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;padding:2px 4px 8px' });
  for (const p of PALETTE) {
    const chip = el('button', {
      title: p.color,
      style: `${fillCSS(p.color, p.pattern, 1)};width:24px;height:24px;border-radius:2px;border:1px solid ${
        bucket.color === p.color ? '#141C26' : 'rgba(0,0,0,.14)'};`,
    });
    chip.addEventListener('click', () => {
      commit();
      bucket.color = p.color;
      emit('structure');
      closeMenus();
    });
    swatches.appendChild(chip);
  }
  pop.appendChild(swatches);

  const patterns = el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;padding:0 4px 6px' });
  for (const pattern of PATTERNS) {
    const chip = el('button', {
      title: pattern,
      style: `${fillCSS(bucket.color, pattern, 1)};width:24px;height:24px;border-radius:2px;border:1px solid ${
        bucket.pattern === pattern ? '#141C26' : 'rgba(0,0,0,.14)'};`,
    });
    chip.addEventListener('click', () => {
      commit();
      bucket.pattern = pattern;
      emit('structure');
      closeMenus();
    });
    patterns.appendChild(chip);
  }
  pop.appendChild(patterns);

  pop.appendChild(el('div', { class: 'sep' }));

  const collapse = el('button', {
    class: 'opt',
    text: bucket.collapsed ? 'Expand bucket' : 'Collapse bucket',
  });
  collapse.addEventListener('click', () => {
    commit();
    bucket.collapsed = !bucket.collapsed;
    emit('structure');
    closeMenus();
  });
  pop.appendChild(collapse);

  const del = el('button', { class: 'opt danger', text: 'Delete bucket' });
  del.addEventListener('click', () => {
    if (confirm(`Delete “${bucket.name}” and its ${bucket.items.length} items?`)) {
      removeBucket(bucket.id);
    }
    closeMenus();
  });
  pop.appendChild(del);
}

/* ------------------------------------------------------ dismissal */

window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.pop')) return;
  closeMenus();
  if (state.selectedEdge && !e.target.closest('.hit')) {
    state.selectedEdge = null;
    renderEdges();
  }
}, true);
