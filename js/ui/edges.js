/**
 * Connection rendering.
 *
 * Two SVG layers sandwich the cards. A connection set to `behind` is drawn on
 * the under-layer as a soft curve at reduced opacity — recorded but not
 * narrated. Everything else is drawn on the over-layer as an orthogonal route
 * that steps around the cards.
 *
 * Each visible line gets three strokes: a pale casing so it stays legible over
 * a patterned header, the line itself, and a fat transparent stroke that exists
 * only to be clickable.
 */
import { state } from '../core/store.js';
import { TYPES, typeOf } from '../config/types.js';
import {
  endpointRect, ownerBucketId, bucketRect, anchorOn,
  routeAround, roundedPath, curvedPath, midpointOf,
} from '../core/geometry.js';
import { el, $, $$ } from '../util/dom.js';
import { adapt } from '../util/patterns.js';
import { token } from '../core/theme.js';

let under;
let over;
let nodes;

export function initEdges(onEdgeClick) {
  under = $('#layer-under');
  over = $('#layer-over');
  nodes = $('#layer-nodes');
  over.addEventListener('click', (e) => {
    const id = e.target.dataset && e.target.dataset.edge;
    if (id) onEdgeClick(id, e.clientX, e.clientY);
  });
}

function markerDefs() {
  let defs = '<defs>';
  for (const [key, raw] of Object.entries(TYPES)) {
    const t = { ...raw, color: adapt(raw.color) };
    defs += `<marker id="m-${key}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${t.color}"/></marker>`;
    defs += `<marker id="m-${key}-arrowOpen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9" fill="none" stroke="${t.color}" stroke-width="1.6"/></marker>`;
    defs += `<marker id="m-${key}-bar" viewBox="0 0 10 10" refX="3" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M2,0 L2,10" stroke="${t.color}" stroke-width="3.4"/></marker>`;
  }
  return `${defs}</defs>`;
}

/**
 * @param {{a:{x:number,y:number}, b:{x:number,y:number}}|null} tempWire
 *        the rubber-band line drawn while a connection is being dragged
 */
export function renderEdges(tempWire = null) {
  if (!over) return;
  /* Read the live tokens once per pass: SVG strokes need real colours, and the
     casing must match whatever paper the current scheme is using. */
  const ground = token('--ground') || '#EAEDF0';
  const ink = token('--ink') || '#141C26';
  const layers = { under: markerDefs(), over: markerDefs() };
  $$('.edgelabel', nodes).forEach((n) => n.remove());

  for (const edge of state.edges) {
    const ra = endpointRect(state, edge.from);
    const rb = endpointRect(state, edge.to);
    if (!ra || !rb) continue;

    const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
    const cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
    const a = anchorOn(ra, cb);
    const b = anchorOn(rb, ca);
    const base = typeOf(edge.type);
    const t = { ...base, color: adapt(base.color) };
    const selected = state.selectedEdge === edge.id;

    const exempt = [ownerBucketId(state, edge.from), ownerBucketId(state, edge.to)];
    const obstacles = state.buckets.filter((x) => !exempt.includes(x.id)).map(bucketRect);

    let d;
    let points = null;
    if (edge.behind) {
      d = curvedPath(a, b);
    } else {
      points = routeAround(a, b, obstacles);
      d = roundedPath(points, 11);
    }

    const marker = t.marker === 'none' ? '' : `marker-end="url(#m-${edge.type}-${t.marker})"`;
    const width = t.width + (selected ? 1.4 : 0);

    let g = '';
    if (!edge.behind) {
      g += `<path d="${d}" fill="none" stroke="${ground}" stroke-width="${t.width + 3.5}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    }
    g += `<path d="${d}" fill="none" stroke="${t.color}" stroke-width="${width}" stroke-dasharray="${t.dash}" stroke-linecap="round" stroke-linejoin="round" opacity="${edge.behind ? 0.5 : 1}" ${marker}/>`;
    g += `<path class="hit" data-edge="${edge.id}" d="${d}" fill="none" stroke="transparent" stroke-width="16"/>`;

    layers[edge.behind ? 'under' : 'over'] += g;

    if (selected) {
      const m = points ? midpointOf(points) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      nodes.appendChild(el('div', {
        class: 'edgelabel',
        style: `left:${m.x}px;top:${m.y}px;color:${t.color}`,
        text: t.label,
      }));
    }
  }

  if (tempWire) {
    layers.over +=
      `<path d="M ${tempWire.a.x} ${tempWire.a.y} L ${tempWire.b.x} ${tempWire.b.y}" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="4 4"/>` +
      `<circle cx="${tempWire.b.x}" cy="${tempWire.b.y}" r="4" fill="${ink}"/>`;
  }

  under.innerHTML = layers.under;
  over.innerHTML = layers.over;
}
