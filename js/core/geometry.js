/**
 * Geometry and routing.
 *
 * Nothing here touches the DOM. Card rectangles are derived arithmetically from
 * bucket position and item count, which means edges can be re-routed during a
 * drag at full frame rate without a single layout read.
 */
import { METRICS } from '../config/palette.js';

/* ---------------------------------------------------------------- rects */

export function bucketRect(b) {
  const body = b.collapsed ? 0 : b.items.length * METRICS.row + METRICS.foot;
  return { x: b.x, y: b.y, w: b.w || METRICS.width, h: METRICS.strip + METRICS.head + body };
}

/**
 * Rect for a connection endpoint. Items in a collapsed bucket fold into the
 * bucket's own rect, so a connection never dangles at nothing.
 */
export function endpointRect(state, ep) {
  if (ep.kind === 'bucket') {
    const b = state.buckets.find((x) => x.id === ep.id);
    return b ? bucketRect(b) : null;
  }
  for (const b of state.buckets) {
    const idx = b.items.findIndex((i) => i.id === ep.id);
    if (idx < 0) continue;
    if (b.collapsed) return bucketRect(b);
    return {
      x: b.x,
      y: b.y + METRICS.strip + METRICS.head + idx * METRICS.row,
      w: b.w || METRICS.width,
      h: METRICS.row,
      row: true,
    };
  }
  return null;
}

/** The bucket a connection endpoint belongs to — used to exempt it from routing. */
export function ownerBucketId(state, ep) {
  if (ep.kind === 'bucket') return ep.id;
  const b = state.buckets.find((x) => x.items.some((i) => i.id === ep.id));
  return b ? b.id : null;
}

/* -------------------------------------------------------------- anchors */

/**
 * Pick the edge of a rect facing a target point. Item rows are short and wide,
 * so they always exit sideways — a wire leaving the top of a 26px row reads as
 * belonging to the row above it.
 */
export function anchorOn(rect, toward) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (rect.row || Math.abs(dx) * rect.h >= Math.abs(dy) * rect.w) {
    return dx >= 0
      ? { x: rect.x + rect.w, y: cy, side: 'r' }
      : { x: rect.x, y: cy, side: 'l' };
  }
  return dy >= 0
    ? { x: cx, y: rect.y + rect.h, side: 'b' }
    : { x: cx, y: rect.y, side: 't' };
}

/** Step out from an anchor along its own normal. */
export function stub(a, n) {
  switch (a.side) {
    case 'l': return { x: a.x - n, y: a.y };
    case 'r': return { x: a.x + n, y: a.y };
    case 't': return { x: a.x, y: a.y - n };
    default:  return { x: a.x, y: a.y + n };
  }
}

/* ------------------------------------------------------------- collision */

function segmentHitsRect(p, q, r, pad) {
  return (
    Math.max(p.x, q.x) >= r.x - pad && Math.min(p.x, q.x) <= r.x + r.w + pad &&
    Math.max(p.y, q.y) >= r.y - pad && Math.min(p.y, q.y) <= r.y + r.h + pad
  );
}

function pathIsClear(points, obstacles, pad = 6) {
  for (let i = 0; i < points.length - 1; i++) {
    for (const r of obstacles) {
      if (segmentHitsRect(points[i], points[i + 1], r, pad)) return false;
    }
  }
  return true;
}

/* --------------------------------------------------------------- routes */

const dedupe = (pts) =>
  pts.filter((p, i) => {
    if (i === 0) return true;
    const q = pts[i - 1];
    return Math.abs(q.x - p.x) > 0.5 || Math.abs(q.y - p.y) > 0.5;
  });

const LANE_GAP = 18;

/**
 * Candidate lane positions along one axis.
 *
 * Sliding a lane outward in fixed increments is the obvious approach and it
 * performs badly: the increment rarely lands inside the gap between two cards.
 * Instead the candidates are derived from the obstacle field itself — just
 * outside each card edge, and down the middle of every gap wide enough to hold
 * a line. They are then tried nearest-first so a route only detours as far as
 * it has to.
 *
 * @param {Array<[number,number]>} spans  [start, end] of each obstacle on this axis
 * @param {number} preferred              the direct lane, tried first
 */
function laneCandidates(spans, preferred) {
  const lanes = new Set([preferred]);
  const edges = [];
  for (const [lo, hi] of spans) {
    lanes.add(lo - LANE_GAP);
    lanes.add(hi + LANE_GAP);
    edges.push(lo, hi);
  }
  edges.sort((u, v) => u - v);
  for (let i = 0; i < edges.length - 1; i++) {
    if (edges[i + 1] - edges[i] > LANE_GAP * 2) lanes.add((edges[i] + edges[i + 1]) / 2);
  }
  return [...lanes]
    .sort((u, v) => Math.abs(u - preferred) - Math.abs(v - preferred))
    .slice(0, 48);
}

/**
 * Orthogonal route that steps around bucket rectangles.
 *
 * Two route families are tried: a vertical lane between the endpoints, and a
 * horizontal detour over or under the field. Each is tested against every card
 * it is not attached to. If nothing clears, the direct lane is drawn anyway —
 * a slightly crossed line is more useful than a missing one.
 */
export function routeAround(a, b, obstacles) {
  const p = stub(a, 20);
  const q = stub(b, 20);
  const aHoriz = a.side === 'l' || a.side === 'r';

  const xs = laneCandidates(obstacles.map((r) => [r.x, r.x + r.w]), (p.x + q.x) / 2);
  const ys = laneCandidates(obstacles.map((r) => [r.y, r.y + r.h]), (p.y + q.y) / 2);

  const vertical = xs.map((x) => [a, p, { x, y: p.y }, { x, y: q.y }, q, b]);
  const horizontal = ys.map((y) => [a, p, { x: p.x, y }, { x: q.x, y }, q, b]);

  const candidates = aHoriz
    ? [...interleave(vertical, horizontal)]
    : [...interleave(horizontal, vertical)];

  for (const c of candidates) if (pathIsClear(c, obstacles)) return dedupe(c);
  return dedupe(candidates[0]);
}

/** Alternate between two candidate families so neither monopolises the search. */
function* interleave(first, second) {
  const n = Math.max(first.length, second.length);
  for (let i = 0; i < n; i++) {
    if (i < first.length) yield first[i];
    if (i < second.length) yield second[i];
  }
}

/** Rounded corners on an orthogonal polyline. */
export function roundedPath(points, radius = 11) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], a = points[i - 1], b = points[i + 1];
    const d1 = Math.hypot(a.x - p.x, a.y - p.y);
    const d2 = Math.hypot(b.x - p.x, b.y - p.y);
    if (d1 < 1 || d2 < 1) { d += ` L ${p.x} ${p.y}`; continue; }
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const s = { x: p.x + ((a.x - p.x) / d1) * r, y: p.y + ((a.y - p.y) / d1) * r };
    const e = { x: p.x + ((b.x - p.x) / d2) * r, y: p.y + ((b.y - p.y) / d2) * r };
    d += ` L ${s.x} ${s.y} Q ${p.x} ${p.y} ${e.x} ${e.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** Soft curve for connections that pass behind cards instead of around them. */
export function curvedPath(a, b) {
  const k = Math.max(50, Math.abs(a.x - b.x) / 2.4);
  const c1 = stub(a, k);
  const c2 = stub(b, k);
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}

export function midpointOf(points) {
  const i = Math.max(0, Math.floor(points.length / 2) - 1);
  const a = points[i];
  const b = points[Math.min(points.length - 1, i + 1)];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
