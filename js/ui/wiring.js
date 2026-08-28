/**
 * Making connections.
 *
 * Press a knob, drag a rubber band to any card or row, release, choose a type.
 * Knobs carry `touch-action:none` so the gesture works on a touch screen
 * without stealing scroll from the rest of the card.
 */
import { toWorld } from './canvas.js';
import { state } from '../core/store.js';
import { endpointRect } from '../core/geometry.js';
import { renderEdges } from './edges.js';
import { $$ } from '../util/dom.js';

let wire = null;
let onComplete = () => {};

export function initWiring(handler) {
  onComplete = handler;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

export function startWire(e, from) {
  e.preventDefault();
  e.stopPropagation();
  const rect = endpointRect(state, from);
  if (!rect) return;
  wire = {
    from,
    a: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
    b: toWorld(e.clientX, e.clientY),
    over: null,
  };
  document.body.style.cursor = 'crosshair';
}

function onMove(e) {
  if (!wire) return;
  wire.b = toWorld(e.clientX, e.clientY);

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const host = under && under.closest ? under.closest('[data-node]') : null;
  $$('.hot').forEach((n) => n.classList.remove('hot'));
  wire.over = null;

  if (host) {
    const [kind, id] = host.dataset.node.split(':');
    const isSelf = kind === wire.from.kind && id === wire.from.id;
    if (!isSelf) {
      wire.over = { kind, id };
      host.classList.add('hot');
    }
  }
  renderEdges(wire);
}

function onUp(e) {
  if (!wire) return;
  const finished = wire;
  wire = null;
  document.body.style.cursor = '';
  $$('.hot').forEach((n) => n.classList.remove('hot'));
  renderEdges();
  if (finished.over) onComplete(finished.from, finished.over, e.clientX, e.clientY);
}

export const isWiring = () => wire !== null;
