/**
 * Boot and orchestration.
 *
 * Everything below is wiring: no module reaches into another's DOM. The store
 * emits typed change events and this file decides what to redraw for each,
 * which keeps a bucket drag from rebuilding forty cards.
 */
import {
  state, subscribe, undo, addBucket, newId, load, removeEdge,
} from './core/store.js';
import { readSaved, clearSaved, save, startAutosave, exportFile, importFile } from './core/persist.js';
import { initTheme, setScheme, toggleMode, getTheme, schemeList, onThemeChange } from './core/theme.js';
import { SEED } from '../data/seed.js';
import { PALETTE } from './config/palette.js';

import { initCanvas, applyWorld, toWorld, goHome, zoomIn, zoomOut, getScroller } from './ui/canvas.js';
import { initBuckets, renderBuckets } from './ui/buckets.js';
import { initEdges, renderEdges } from './ui/edges.js';
import { initWiring } from './ui/wiring.js';
import { initCalendar, renderCalendar } from './ui/calendar.js';
import { initSprints, renderSprints } from './ui/sprints.js';
import { renderLegend } from './ui/legend.js';
import { initDetail, renderDetail, closeDetail, isDetailOpen } from './ui/detail.js';
import { initResolve } from './ui/resolve.js';
import { openTypeMenu, openEdgeMenu, closeMenus } from './ui/popover.js';
import { $, $$, el } from './util/dom.js';

/* ------------------------------------------------------------- start */

initTheme();
initCanvas();
initBuckets();
initEdges(handleEdgeClick);
initWiring(handleWireComplete);
initCalendar();
initSprints();
initDetail();
initResolve();

bootBoard();
startAutosave();
/* Autosave only reacts to later changes, and the board's initial load has
   already emitted by now. Write once here so a first visit records which seed
   generation it came from — without that stamp, the next release can't tell an
   untouched demo from a board someone has worked on. */
save();

buildSchemePicker();
renderLegend();
setView('sprints');
goHome();

/* -------------------------------------------------------------- board */

/* A function declaration, not a const arrow: bootBoard() runs at the top of
   this module, above these definitions, and a const would still be in the
   temporal dead zone when it got there. */
function freshSeed() {
  /* The seed is plain JSON, so a JSON clone is both sufficient and portable —
     it keeps the module off structuredClone, which older browsers lack. */
  return JSON.parse(JSON.stringify(SEED));
}

/** Load the demo board, replacing whatever is there. */
function loadSeed() {
  load(freshSeed(), { fromSeed: true, seedVersion: SEED.seedVersion });
}

/**
 * Decide which board wins on boot.
 *
 * A saved board normally wins — that is the whole point of autosave. The one
 * exception is a board that is still the untouched demo from an older release:
 * that gets replaced, so shipping a new data/seed.js actually reaches people
 * who have opened Runway before. The moment anyone edits a board, `fromSeed`
 * clears and it is never replaced again.
 */
function bootBoard() {
  if (new URL(window.location.href).searchParams.has('reset')) { loadSeed(); return; }
  const saved = readSaved();
  if (!saved) { loadSeed(); return; }
  const staleDemo = saved.fromSeed && saved.seedVersion !== SEED.seedVersion;
  if (staleDemo) loadSeed();
  else load(saved);
}

function resetBoard() {
  const touched = !state.fromSeed;
  const warning = touched
    ? 'Replace this board with the demo board? Anything you have added will be lost.'
    : 'Reload the demo board?';
  if (!confirm(warning)) return;
  clearSaved();
  loadSeed();
  goHome();
}

/* --------------------------------------------------------- rendering */

function renderAll() {
  applyWorld();
  renderBuckets();
  renderEdges();
  renderCalendar();
  renderSprints();
  renderDetail();
}

subscribe((kind) => {
  if (kind === 'structure') { renderBuckets(); renderEdges(); renderCalendar(); renderSprints(); renderDetail(); }
  else if (kind === 'geometry') renderEdges();
  else if (kind === 'edges') { renderEdges(); renderSprints(); renderBuckets(); renderDetail(); }
  else if (kind === 'view') { renderCalendar(); renderSprints(); }
});

/* A theme change repaints everything that draws colour in JS rather than CSS:
   the SVG connection layer and every pattern fill. */
onThemeChange(() => {
  syncModeButton();
  renderAll();
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
  if (button) setView(button.dataset.view);
});

function setView(view) {
  state.view = view;
  $('#sprints').hidden = view !== 'sprints';
  $('#scroller').hidden = view !== 'canvas';
  $('#calendar').hidden = view !== 'calendar';
  $('#legend').hidden = view !== 'canvas';
  $('#hint').hidden = view !== 'canvas';
  $$('#viewSwitch .tool').forEach((b) => b.classList.toggle('on', b.dataset.view === view));

  const canvasOnly = ['[data-act="add-bucket"]', '[data-act="home"]', '[data-act="zoom-in"]',
    '[data-act="zoom-out"]', '#zoomLabel', '[data-canvas-only]'];
  for (const sel of canvasOnly) {
    const node = $(sel);
    if (node) node.hidden = view !== 'canvas';
  }

  if (view === 'canvas') { applyWorld(); renderBuckets(); renderEdges(); }
  if (view === 'calendar') renderCalendar();
  if (view === 'sprints') renderSprints();
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
    case 'reset': resetBoard(); break;
    case 'mode': toggleMode(); break;
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

function buildSchemePicker() {
  const pick = $('#schemePick');
  for (const s of schemeList()) {
    pick.appendChild(el('option', { value: s.id, text: s.label, title: s.note }));
  }
  pick.value = getTheme().scheme;
  pick.addEventListener('change', () => setScheme(pick.value));
  syncModeButton();
}

function syncModeButton() {
  const { mode, scheme } = getTheme();
  const button = $('#modeToggle');
  if (button) {
    button.textContent = mode === 'dark' ? 'Light' : 'Dark';
    button.title = `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`;
  }
  const pick = $('#schemePick');
  if (pick && pick.value !== scheme) pick.value = scheme;
}

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
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.key === 'Escape') {
    if (!$('#modal').hidden) return;      /* the dialog handles its own Escape */
    if (isDetailOpen()) { closeDetail(); return; }
    closeMenus();
    state.selectedEdge = null;
    renderEdges();
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedEdge) {
    e.preventDefault();
    removeEdge(state.selectedEdge);
  }
  if (e.key === 's') setView('sprints');
  if (e.key === 'b') setView('canvas');
  if (e.key === 'c') setView('calendar');
  if (e.key === 'd' && !e.metaKey && !e.ctrlKey) toggleMode();
});
