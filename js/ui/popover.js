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
  state, addEdge, updateEdge, removeEdge, removeItem, removeBucket,
  commit, emit, labelFor, activeSprint, isDropped, dropItem,
  addColumn, renameColumn, removeColumn, moveColumn, isFixedColumn,
} from '../core/store.js';
import { exclusiveGroup } from '../core/relations.js';
import { requestStatus, requestMove, requestRestore } from './resolve.js';
import { fillCSS } from '../util/patterns.js';
import { el } from '../util/dom.js';
import { renderEdges } from './edges.js';
import { openDetail } from './detail.js';

export function closeMenus() {
  document.querySelectorAll('.pop').forEach((n) => n.remove());
}

/**
 * Place a popover so it is fully on screen.
 *
 * The old version clamped against a guessed height, which meant a menu taller
 * than the guess opened past the bottom edge with no way to reach the rest of
 * it — the window scrolls, a fixed-position element does not. This measures the
 * menu after it is in the document, flips it above the cursor when there is more
 * room there, and caps its height so a long menu scrolls inside itself.
 */
function popAt(x, y) {
  closeMenus();
  const pop = el('div', { class: 'pop', style: 'left:-9999px;top:-9999px' });
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(pop);
  /* Position on the next frame, once the caller has filled it in. */
  requestAnimationFrame(() => place(pop, x, y));
  pop.dataset.anchorX = x;
  pop.dataset.anchorY = y;
  return pop;
}

const MARGIN = 10;

function place(pop, x, y) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = pop.getBoundingClientRect();

  const below = vh - y - MARGIN;
  const above = y - MARGIN;
  let top;
  if (rect.height <= below) top = y;
  else if (rect.height <= above) top = y - rect.height;
  else {
    /* Taller than either side: pin it to the roomier half and let it scroll. */
    pop.style.maxHeight = `${Math.max(below, above) - MARGIN}px`;
    top = below >= above ? y : MARGIN;
  }
  const left = Math.max(MARGIN, Math.min(x, vw - rect.width - MARGIN));
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(MARGIN, top)}px`;
}

/* A fixed popover cannot follow a scrolling page, so it closes instead of
   drifting away from whatever it was describing. */
window.addEventListener('resize', closeMenus);

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

/* --------------------------------------------------------- task */

/**
 * The canvas context menu.
 *
 * Completing a task from here settles an oxygen choice exactly as committing to
 * a sprint does — the decision is the same decision, so it has to run through
 * the same planner rather than writing `status` directly. The menu names the
 * consequence up front so the dialog is never a surprise.
 */
export function openItemContextMenu(x, y, item, bucket) {
  const pop = popAt(x, y);
  pop.appendChild(el('div', { class: 'ph', text: bucket.name }));

  const rivals = exclusiveGroup(item.id).filter((r) => !isDropped(r.item) && r.item.status !== 'done');
  const sprint = activeSprint();

  action(pop, 'Open details', () => openDetail(item.id));

  if (isDropped(item)) {
    action(pop, 'Restore', () => requestRestore(item.id));
  } else {
    if (item.status === 'done') {
      action(pop, 'Reopen', () => requestStatus(item.id, 'todo'));
    } else {
      action(pop, 'Mark done',
        () => requestStatus(item.id, 'done'),
        rivals.length
          ? `settles an either/or — drops ${rivals.length === 1 ? rivals[0].item.title : `${rivals.length} others`}`
          : null);
    }

    if (sprint && item.sprintId !== sprint.id) {
      action(pop, `Send to ${sprint.name}`,
        () => requestMove(item.id, sprint.id),
        rivals.length
          ? `settles an either/or — drops ${rivals.length === 1 ? rivals[0].item.title : `${rivals.length} others`}`
          : null);
    } else if (sprint && item.sprintId === sprint.id) {
      action(pop, 'Return to backlog', () => requestMove(item.id, null));
    }

    pop.appendChild(el('div', { class: 'sep' }));
    action(pop, 'Drop', () => dropItem(item.id), 'decided against, kept on record');
  }

  pop.appendChild(el('div', { class: 'sep' }));
  const del = el('button', { class: 'opt danger', text: 'Delete task' });
  del.addEventListener('click', () => {
    if (confirm(`Delete “${item.title}”? Dropping keeps it on record instead.`)) removeItem(item.id);
    closeMenus();
  });
  pop.appendChild(del);
}

function action(pop, label, onClick, sub) {
  const b = el('button', { class: 'opt' }, [
    el('span', {}, [
      document.createTextNode(label),
      sub ? el('span', { class: 'sub', text: sub }) : null,
    ]),
  ]);
  b.addEventListener('click', () => { onClick(); closeMenus(); });
  pop.appendChild(b);
  return b;
}

/* ------------------------------------------------------ columns */

/**
 * The board columns editor.
 *
 * The four defaults can be renamed and reordered but not removed — the rest of
 * the app reasons about them, and a board with no Done column could not close a
 * sprint. Their delete controls are absent rather than disabled: a button that
 * exists only to refuse you is worse than no button.
 */
export function openColumnsMenu(x, y) {
  const pop = popAt(x, y);
  pop.appendChild(el('div', { class: 'ph', text: 'Board columns' }));

  state.columns.forEach((column, i) => {
    const name = el('input', { type: 'text', value: column.label, class: 'col-name' });
    name.addEventListener('change', () => renameColumn(column.id, name.value));

    const up = el('button', { class: 'opt-mini', text: '↑', title: 'Move left' });
    up.addEventListener('click', () => { moveColumn(column.id, -1); reopen(x, y); });
    up.disabled = i === 0;

    const down = el('button', { class: 'opt-mini', text: '↓', title: 'Move right' });
    down.addEventListener('click', () => { moveColumn(column.id, 1); reopen(x, y); });
    down.disabled = i === state.columns.length - 1;

    const controls = [name, up, down];
    if (!isFixedColumn(column.id)) {
      const cut = el('button', { class: 'opt-mini danger', text: '×', title: 'Remove column' });
      cut.addEventListener('click', () => {
        if (confirm(`Remove “${column.label}”? Anything in it returns to To do.`)) {
          removeColumn(column.id);
          reopen(x, y);
        }
      });
      controls.push(cut);
    } else {
      controls.push(el('span', { class: 'opt-lock', text: '·', title: 'Default column — can’t be removed' }));
    }

    pop.appendChild(el('div', { class: 'col-row' }, controls));
    if (column.derived) {
      pop.appendChild(el('div', {
        class: 'col-note',
        text: 'Filled automatically from your connections. Drag a card in to add a blocker Runway can’t see.',
      }));
    }
  });

  pop.appendChild(el('div', { class: 'sep' }));

  const draft = el('input', { type: 'text', placeholder: 'New column', class: 'col-name' });
  const add = el('button', { class: 'opt-mini', text: '+', title: 'Add column' });
  const submit = () => {
    if (!draft.value.trim()) return;
    addColumn(draft.value);
    reopen(x, y);
  };
  add.addEventListener('click', submit);
  draft.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  pop.appendChild(el('div', { class: 'col-row' }, [draft, add]));
}

/* Rebuild in place so the list reflects the change without the menu vanishing. */
const reopen = (x, y) => openColumnsMenu(x, y);

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
        bucket.color === p.color ? 'var(--ink)' : 'var(--line)'};`,
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
        bucket.pattern === pattern ? 'var(--ink)' : 'var(--line)'};`,
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
