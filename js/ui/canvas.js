/**
 * The viewport.
 *
 * Native scroll rather than a custom transform-only pan: you get real
 * scrollbars, trackpad momentum, and browser accessibility for free. The world
 * is a fixed-size div scaled with a transform; the scroller's spacer is sized
 * to match so the scrollbars stay honest at every zoom level.
 */
import { state, emit } from '../core/store.js';
import { bucketRect } from '../core/geometry.js';
import { $ } from '../util/dom.js';

const MARGIN_X = 900;
const MARGIN_Y = 800;
const TRIGGER_X = 600;
const TRIGGER_Y = 500;

let scroller, canvas, world, zoomLabel;

export function initCanvas() {
  scroller = $('#scroller');
  canvas = $('#canvas');
  world = $('#world');
  zoomLabel = $('#zoomLabel');
  applyWorld();
  bindPan();
  bindWheelZoom();
}

export function applyWorld() {
  world.style.width = `${state.world.w}px`;
  world.style.height = `${state.world.h}px`;
  world.style.transform = `scale(${state.zoom})`;
  canvas.style.width = `${state.world.w * state.zoom}px`;
  canvas.style.height = `${state.world.h * state.zoom}px`;
  for (const id of ['#layer-under', '#layer-over']) {
    const svg = $(id);
    svg.setAttribute('width', state.world.w);
    svg.setAttribute('height', state.world.h);
  }
  if (zoomLabel) zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

/** Screen coordinates → world coordinates. */
export function toWorld(clientX, clientY) {
  const r = scroller.getBoundingClientRect();
  return {
    x: (scroller.scrollLeft + clientX - r.left) / state.zoom,
    y: (scroller.scrollTop + clientY - r.top) / state.zoom,
  };
}

/**
 * Grow the canvas when a card is pushed toward the edge. The world only ever
 * grows during a drag — shrinking mid-gesture would yank the scroll position
 * out from under the pointer.
 */
export function growToFit() {
  let maxX = 0;
  let maxY = 0;
  for (const b of state.buckets) {
    const r = bucketRect(b);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  let changed = false;
  if (maxX + TRIGGER_X > state.world.w) { state.world.w = Math.round(maxX + MARGIN_X); changed = true; }
  if (maxY + TRIGGER_Y > state.world.h) { state.world.h = Math.round(maxY + MARGIN_Y); changed = true; }
  if (changed) applyWorld();
  return changed;
}

/** Reclaim empty space. Only on request, never automatically. */
export function shrinkToContent() {
  let maxX = 0;
  let maxY = 0;
  for (const b of state.buckets) {
    const r = bucketRect(b);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  state.world.w = Math.max(1600, Math.round(maxX + MARGIN_X));
  state.world.h = Math.max(1100, Math.round(maxY + MARGIN_Y));
  applyWorld();
}

export function setZoom(z) {
  const next = Math.min(1.6, Math.max(0.4, Math.round(z * 20) / 20));
  if (next === state.zoom) return;
  const cx = scroller.scrollLeft + scroller.clientWidth / 2;
  const cy = scroller.scrollTop + scroller.clientHeight / 2;
  const ratio = next / state.zoom;
  state.zoom = next;
  applyWorld();
  scroller.scrollLeft = cx * ratio - scroller.clientWidth / 2;
  scroller.scrollTop = cy * ratio - scroller.clientHeight / 2;
  emit('view');
}

export const zoomIn = () => setZoom(state.zoom + 0.1);
export const zoomOut = () => setZoom(state.zoom - 0.1);

/** Scroll to the top-left of whatever has been placed. */
export function goHome() {
  let x = Infinity;
  let y = Infinity;
  for (const b of state.buckets) { x = Math.min(x, b.x); y = Math.min(y, b.y); }
  if (!Number.isFinite(x)) { x = 0; y = 0; }
  scroller.scrollLeft = Math.max(0, (x - 40) * state.zoom);
  scroller.scrollTop = Math.max(0, (y - 40) * state.zoom);
}

/* ------------------------------------------------------------- panning */

let pan = null;

function bindPan() {
  scroller.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.bucket') || e.target.closest('.hit') || e.target.closest('.pop')) return;
    pan = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
    scroller.classList.add('panning');
  });
  window.addEventListener('pointermove', (e) => {
    if (!pan) return;
    scroller.scrollLeft = pan.left - (e.clientX - pan.x);
    scroller.scrollTop = pan.top - (e.clientY - pan.y);
  });
  window.addEventListener('pointerup', () => {
    pan = null;
    scroller.classList.remove('panning');
  });
}

function bindWheelZoom() {
  scroller.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(state.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
  }, { passive: false });
}

export const getScroller = () => scroller;
