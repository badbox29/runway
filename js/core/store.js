/**
 * The store.
 *
 * A plain object plus a subscription list. Change events are typed so the UI
 * can do the cheap thing when only positions moved:
 *
 *   'structure' — cards, items, sprints changed → rebuild DOM
 *   'geometry'  — something moved → re-route connections only
 *   'edges'     — connections changed → redraw the SVG layers
 *   'view'      — view switch, zoom, selection
 *
 * Undo is a snapshot stack. For a graph this small, structural sharing would be
 * premature; a JSON clone per committed action is a few kilobytes and correct.
 *
 * An item has one completion field, `status` ∈ todo | doing | done. There is no
 * separate `done` boolean: two fields meaning the same thing is two fields that
 * can disagree. Boards saved before sprints existed are migrated on load.
 */

const listeners = new Set();

export const STATUSES = ['todo', 'doing', 'done'];
export const POINT_SCALE = [1, 2, 3, 5, 8];
export const PREREQ_TYPES = ['depends', 'blocks', 'waiting'];

export const state = {
  buckets: [],
  edges: [],
  sprints: [],
  currentSprint: null,
  world: { w: 3200, h: 2200 },
  zoom: 1,
  view: 'sprints',
  selectedEdge: null,
  calendar: { year: new Date().getFullYear(), month: new Date().getMonth(), selected: null },
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

const snapshot = () =>
  JSON.stringify({ buckets: state.buckets, edges: state.edges, sprints: state.sprints });

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
  state.sprints = data.sprints || [];
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

export function allItems() {
  const out = [];
  for (const b of state.buckets) for (const item of b.items) out.push({ bucket: b, item });
  return out;
}

export const getSprint = (id) => state.sprints.find((s) => s.id === id);

/** Everything not committed to a sprint. */
export const backlogItems = () => allItems().filter(({ item }) => !item.sprintId);

export const sprintItems = (sprintId) =>
  allItems().filter(({ item }) => item.sprintId === sprintId);

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

/**
 * Unfinished prerequisites for an item, read off the connection graph.
 *
 * This is what makes the two views one product rather than two apps: a
 * dependency you drew on the canvas shows up as a warning on the sprint board.
 * Connection direction is "from needs to", so we look at edges leaving this
 * item along a prerequisite type and report any target that isn't done.
 */
export function blockersFor(itemId) {
  const out = [];
  for (const e of state.edges) {
    if (e.from.kind !== 'item' || e.from.id !== itemId) continue;
    if (!PREREQ_TYPES.includes(e.type)) continue;
    if (e.to.kind !== 'item') continue;
    const found = getItem(e.to.id);
    if (found && found.item.status !== 'done') {
      out.push({ item: found.item, bucket: found.bucket, type: e.type });
    }
  }
  return out;
}

/** Counts and points for a sprint, or for a set of entries. */
export function progressOf(entries) {
  let done = 0;
  let points = 0;
  let donePoints = 0;
  for (const { item } of entries) {
    const p = item.points || 0;
    points += p;
    if (item.status === 'done') { done += 1; donePoints += p; }
  }
  return {
    total: entries.length,
    done,
    points,
    donePoints,
    pct: points ? Math.round((donePoints / points) * 100)
      : entries.length ? Math.round((done / entries.length) * 100) : 0,
  };
}

/** Whole days from today until an ISO date; negative once it has passed. */
export function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((then - now) / 86400000);
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

export function addItem(bucketId, title, extra = {}) {
  commit();
  getBucket(bucketId)?.items.push({
    id: newId('i'), title, date: null, status: 'todo', points: null, sprintId: null, ...extra,
  });
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

export function cyclePoints(id) {
  const found = getItem(id);
  if (!found) return;
  const at = POINT_SCALE.indexOf(found.item.points);
  const next = at < 0 ? POINT_SCALE[0]
    : at === POINT_SCALE.length - 1 ? null
      : POINT_SCALE[at + 1];
  updateItem(id, { points: next });
}

/* ------------------------------------------------------------- sprints */

export function addSprint({ name, start, end }) {
  commit();
  const sprint = { id: newId('s'), name, start: start || null, end: end || null, status: 'planned' };
  state.sprints.push(sprint);
  state.currentSprint = sprint.id;
  emit('structure');
  return sprint;
}

export function updateSprint(id, patch) {
  commit();
  const s = getSprint(id);
  if (s) Object.assign(s, patch);
  emit('structure');
}

export function startSprint(id) {
  commit();
  for (const s of state.sprints) if (s.status === 'active') s.status = 'done';
  const s = getSprint(id);
  if (s) s.status = 'active';
  state.currentSprint = id;
  emit('structure');
}

/**
 * Close a sprint. Unfinished work returns to the backlog rather than being
 * dragged along silently — carrying it over invisibly is how a sprint stops
 * meaning anything.
 */
export function completeSprint(id) {
  commit();
  const s = getSprint(id);
  if (s) s.status = 'done';
  let returned = 0;
  for (const { item } of sprintItems(id)) {
    if (item.status !== 'done') { item.sprintId = null; item.status = 'todo'; returned += 1; }
  }
  emit('structure');
  return returned;
}

export function removeSprint(id) {
  commit();
  for (const { item } of sprintItems(id)) { item.sprintId = null; }
  state.sprints = state.sprints.filter((s) => s.id !== id);
  if (state.currentSprint === id) state.currentSprint = state.sprints[0]?.id || null;
  emit('structure');
}

export function assignToSprint(itemId, sprintId, status) {
  commit();
  const found = getItem(itemId);
  if (found) {
    found.item.sprintId = sprintId;
    if (status) found.item.status = status;
    else if (!sprintId) found.item.status = found.item.status === 'done' ? 'done' : 'todo';
  }
  emit('structure');
}

/* ------------------------------------------------------------- edges */

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

/* -------------------------------------------------------- load / save */

/**
 * Fill in fields added after a board was saved. Older boards carry `done`
 * booleans and no sprint fields; both are folded into `status` here so the rest
 * of the app never has to ask which vintage of board it is looking at.
 */
function normalize(data) {
  const buckets = (data.buckets || []).map((b) => ({
    collapsed: false,
    w: 222,
    ...b,
    items: (b.items || []).map((item) => {
      const { done, ...rest } = item;
      return {
        date: null,
        points: null,
        sprintId: null,
        status: done ? 'done' : 'todo',
        ...rest,
        ...(rest.status ? { status: rest.status } : {}),
      };
    }),
  }));
  return {
    buckets,
    edges: data.edges || [],
    sprints: data.sprints || [],
    world: data.world || state.world,
    currentSprint: data.currentSprint || null,
  };
}

export function load(data) {
  const clean = normalize(data);
  state.buckets = clean.buckets;
  state.edges = clean.edges;
  state.sprints = clean.sprints;
  state.world = clean.world;
  state.currentSprint = clean.currentSprint
    || state.sprints.find((s) => s.status === 'active')?.id
    || state.sprints[0]?.id
    || null;
  state.selectedEdge = null;
  emit('structure');
}

export const serialize = () => ({
  version: 2,
  savedAt: new Date().toISOString(),
  world: state.world,
  buckets: state.buckets,
  edges: state.edges,
  sprints: state.sprints,
  currentSprint: state.currentSprint,
});
