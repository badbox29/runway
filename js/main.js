/**
 * Boot and orchestration.
 *
 * Everything below is wiring: no module reaches into another's DOM. The store
 * emits typed change events and this file decides what to redraw for each,
 * which keeps a bucket drag from rebuilding forty cards.
 */
import { state, subscribe, undo, addBucket, newId, load, removeEdge } from './core/store.js';
import { restore, startAutosave, exportFile, importFile } from './core/persist.js';
import { SEED } from '../data/seed.js';
import { PALETTE } from './config/palette.js';

import { initCanvas, applyWorld, toWorld, goHome, zoomIn, zoomOut, getScroller } from './ui/canvas.js';
import { initBuckets, renderBuckets } from './ui/buckets.js';
import { initEdges, renderEdges } from './ui/edges.js';
import { initWiring } from './ui/wiring.js';
import { initCalendar, renderCalendar } from './ui/calendar.js';
import { renderLegend } from './ui/legend.js';
import { openTypeMenu, openEdgeMenu, closeMenus } from './ui/popover.js';
import { $, $$ } from './util/dom.js';

/* ------------------------------------------------------------- start */

initCanvas();
initBuckets();
initEdges(handleEdgeClick);
initWiring(handleWireComplete);
initCalendar();

/* The seed is plain JSON, so a JSON clone is both sufficient and portable —
   it keeps the module off structuredClone, which older browsers lack. */
if (!restore()) load(JSON.parse(JSON.stringify(SEED)));
startAutosave();

renderLegend();
renderAll();
goHome();

/* --------------------------------------------------------- rendering */

function renderAll() {
  applyWorld();
  renderBuckets();
  renderEdges();
  renderCalendar();
}

subscribe((kind) => {
  if (kind === 'structure') { renderBuckets(); renderEdges(); renderCalendar(); }
  else if (kind === 'geometry') renderEdges();
  else if (kind === 'edges') renderEdges();
  else if (kind === 'view') renderCalendar();
});

/* ------------------------------------------------------ interactions */

function handleWireComplete(from, to, x, y) {
  openTypeMenu(x, y, from, to);
}

function handleEdgeClick(id, x, y) {
  state.selectedEdge = id;
  renderEdges();
  openEdgeMenu(x, y, id);
}

/* ------------------------------------------------------------ chrome */

$('#viewSwitch').addEventListener('click', (e) => {
  const button = e.target.closest('[data-view]');
  if (!button) return;
  setView(button.dataset.view);
});

function setView(view) {
  state.view = view;
  $('#scroller').hidden = view !== 'canvas';
  $('#calendar').hidden = view !== 'calendar';
  $('#legend').hidden = view !== 'canvas';
  $('#hint').hidden = view !== 'canvas';
  $('#viewLabel').textContent = view === 'canvas' ? 'canvas' : 'month';
  $$('#viewSwitch .tool').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  for (const sel of ['[data-act="add-bucket"]', '[data-act="home"]', '[data-act="zoom-in"]',
    '[data-act="zoom-out"]', '#zoomLabel']) {
    $(sel).hidden = view !== 'canvas';
  }
  renderCalendar();
}

document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (!act) return;
  switch (act.dataset.act) {
    case 'add-bucket': createBucket(); break;
    case 'home': goHome(); break;
    case 'undo': undo(); break;
    case 'zoom-in': zoomIn(); break;
    case 'zoom-out': zoomOut(); break;
    case 'export': exportFile(); break;
    case 'import': $('#fileInput').click(); break;
    default: break;
  }
});

$('#fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try { await importFile(file); goHome(); }
  catch (err) { alert(err.message); }
  e.target.value = '';
});

function createBucket() {
  const name = prompt('Bucket name');
  if (!name || !name.trim()) return;
  const scroller = getScroller();
  const centre = toWorld(
    scroller.clientWidth / 2,
    scroller.getBoundingClientRect().top + scroller.clientHeight / 2
  );
  const p = PALETTE[state.buckets.length % PALETTE.length];
  addBucket({
    id: newId('b'),
    name: name.trim(),
    color: p.color,
    pattern: p.pattern,
    x: Math.max(0, Math.round(centre.x - 111)),
    y: Math.max(0, Math.round(centre.y - 40)),
    w: 222,
    collapsed: false,
    items: [],
  });
}

/* ---------------------------------------------------------- keyboard */

window.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  if (typing) return;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.key === 'Escape') { closeMenus(); state.selectedEdge = null; renderEdges(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedEdge) {
    e.preventDefault();
    removeEdge(state.selectedEdge);
  }
  if (e.key === 'c' && state.view === 'canvas') setView('calendar');
  if (e.key === 'b' && state.view === 'calendar') setView('canvas');
});
