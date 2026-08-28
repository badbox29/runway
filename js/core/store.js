/**
 * The store.
 *
 * A plain object plus a subscription list. Change events are typed so the UI
 * can do the cheap thing when only positions moved:
 *
 *   'structure' — cards added, removed, collapsed, retitled → rebuild DOM
 *   'geometry'  — something moved → re-route edges only
 *   'edges'     — connections changed → redraw the SVG layers
 *   'view'      — canvas/calendar switch, zoom, selection
 *
 * Undo is a snapshot stack. For a graph this small, structural sharing would be
 * premature; a JSON clone per committed action is a few kilobytes and correct.
 */

const listeners = new Set();

export const state = {
  buckets: [],
  edges: [],
  world: { w: 3200, h: 2200 },
  zoom: 1,
  view: 'canvas',
  selectedEdge: null,
  calendar: { year: 2026, month: 7, selected: null },
};

let seq = 1;
export const newId = (prefix) => `${prefix}${seq++}_${Math.random().toString(36).slice(2, 7)}`;

/* ------------------------------------------------------------ events */

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(kind = 'structure') {
  for (const fn of listeners) fn(kind);
}

/* -------------------------------------------------------------- undo */

const undoStack = [];
const MAX_UNDO = 60;

const snapshot = () => JSON.stringify({ buckets: state.buckets, edges: state.edges });

/** Call before a mutation you want to be undoable. */
export function commit() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

export function undo() {
  const prev = undoStack.pop();
  if (!prev) return false;
  const data = JSON.parse(prev);
  state.buckets = data.buckets;
  state.edges = data.edges;
  state.selectedEdge = null;
  emit('structure');
  return true;
}

export const canUndo = () => undoStack.length > 0;

/* ------------------------------------------------------------ queries */

export const getBucket = (id) => state.buckets.find((b) => b.id === id);

export function getItem(id) {
  for (const b of state.buckets) {
    const item = b.items.find((i) => i.id === id);
    if (item) return { bucket: b, item };
  }
  return null;
}

export function labelFor(ep) {
  if (ep.kind === 'bucket') {
    const b = getBucket(ep.id);
    return b ? b.name : '—';
  }
  const found = getItem(ep.id);
  return found ? found.item.title : '—';
}

/** Every dated item, keyed by ISO date, with its bucket attached. */
export function scheduledByDate() {
  const map = new Map();
  for (const b of state.buckets) {
    for (const item of b.items) {
      if (!item.date) continue;
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push({ item, bucket: b });
    }
  }
  return map;
}

/* ----------------------------------------------------------- mutations */

export function addBucket(bucket) { commit(); state.buckets.push(bucket); emit('structure'); }

export function removeBucket(id) {
  commit();
  const itemIds = new Set((getBucket(id)?.items || []).map((i) => i.id));
  state.buckets = state.buckets.filter((b) => b.id !== id);
  state.edges = state.edges.filter(
    (e) => ![e.from, e.to].some((ep) =>
      (ep.kind === 'bucket' && ep.id === id) || (ep.kind === 'item' && itemIds.has(ep.id)))
  );
  emit('structure');
}

export function addItem(bucketId, title, date = null) {
  commit();
  getBucket(bucketId)?.items.push({ id: newId('i'), title, date, done: false });
  emit('structure');
}

export function removeItem(id) {
  commit();
  for (const b of state.buckets) b.items = b.items.filter((i) => i.id !== id);
  state.edges = state.edges.filter(
    (e) => ![e.from, e.to].some((ep) => ep.kind === 'item' && ep.id === id)
  );
  emit('structure');
}

export function updateItem(id, patch) {
  commit();
  const found = getItem(id);
  if (found) Object.assign(found.item, patch);
  emit('structure');
}

/** Move an item into another bucket — it takes on that bucket's colour. */
export function moveItem(id, toBucketId, index = -1) {
  commit();
  let carried = null;
  for (const b of state.buckets) {
    const i = b.items.findIndex((x) => x.id === id);
    if (i >= 0) { carried = b.items.splice(i, 1)[0]; break; }
  }
  const target = getBucket(toBucketId);
  if (carried && target) {
    if (index < 0 || index > target.items.length) target.items.push(carried);
    else target.items.splice(index, 0, carried);
  }
  emit('structure');
}

export function addEdge(type, from, to) {
  commit();
  const dup = state.edges.some(
    (e) => e.type === type &&
      ((sameEp(e.from, from) && sameEp(e.to, to)) || (sameEp(e.from, to) && sameEp(e.to, from)))
  );
  if (!dup) state.edges.push({ id: newId('e'), type, from, to, behind: false });
  emit('edges');
}

export function updateEdge(id, patch) {
  commit();
  const e = state.edges.find((x) => x.id === id);
  if (e) Object.assign(e, patch);
  emit('edges');
}

export function removeEdge(id) {
  commit();
  state.edges = state.edges.filter((e) => e.id !== id);
  if (state.selectedEdge === id) state.selectedEdge = null;
  emit('edges');
}

export const sameEp = (a, b) => a && b && a.kind === b.kind && a.id === b.id;

export function load(data) {
  state.buckets = data.buckets || [];
  state.edges = data.edges || [];
  if (data.world) state.world = data.world;
  state.selectedEdge = null;
  emit('structure');
}

export const serialize = () => ({
  version: 1,
  savedAt: new Date().toISOString(),
  world: state.world,
  buckets: state.buckets,
  edges: state.edges,
});
