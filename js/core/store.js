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

/**
 * Board columns.
 *
 * The four defaults are fixed: they can be renamed and reordered but not
 * deleted, because the rest of the app reasons about them. `done` decides sprint
 * progress and what survives closing a sprint; `todo` is where returned and
 * restored work lands. A board with no such column would have nowhere to put
 * things.
 *
 * `blocked` is the odd one, and deliberately so — see laneOf(). Runway already
 * knows what is blocked, from the connection graph. Making Blocked a lane you
 * drag into would create a second, contradictory answer to the same question:
 * a card parked in Blocked with every prerequisite finished, or a card in To do
 * with a red dot on it. That is the `done`-boolean-beside-`status` mistake in a
 * new costume. So the column is computed first and manual second: a task with
 * unmet prerequisites appears there on its own, and dragging a card in records
 * a block that the graph doesn't know about.
 */
export const DEFAULT_COLUMNS = [
  { id: 'todo', label: 'To do', fixed: true },
  { id: 'blocked', label: 'Blocked', fixed: true, derived: true },
  { id: 'doing', label: 'In progress', fixed: true },
  { id: 'done', label: 'Done', fixed: true },
];

export const FIXED_COLUMN_IDS = DEFAULT_COLUMNS.map((c) => c.id);

/** Kept for the parts of the app that only care about the workflow statuses. */
export const STATUSES = ['todo', 'doing', 'done'];

/**
 * Dropped: decided against, kept on record.
 *
 * An either/or is a choice about where finite attention goes, and committing to
 * one arm is how the choice gets made. The arms not taken need a state that is
 * neither `done` (a lie), nor deleted (destroys the task and the connection that
 * explains it), nor left in the backlog (where it resurfaces in three months as
 * mystery work nobody can account for). Dropped keeps the task, keeps the edge,
 * stays out of the way, and stays reversible.
 */
export const DROPPED = 'dropped';

export const isDropped = (item) => item.status === DROPPED;
export const isLive = (item) => item.status !== DROPPED;
export const POINT_SCALE = [1, 2, 3, 5, 8];
export const PREREQ_TYPES = ['depends', 'blocks', 'waiting'];

export const state = {
  buckets: [],
  edges: [],
  sprints: [],
  columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
  currentSprint: null,
  /* True while the board is still the untouched demo. The first edit clears
     it, which is what lets a newer demo replace an older one without ever
     overwriting work someone has actually done. */
  fromSeed: false,
  seedVersion: null,
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
let batching = false;

const snapshot = () => JSON.stringify({
  buckets: state.buckets, edges: state.edges, sprints: state.sprints, columns: state.columns,
});

/**
 * Call before a mutation you want to be undoable.
 *
 * This is also the single place that knows a board has been touched: every
 * mutation goes through here, so clearing `fromSeed` here means no future
 * mutation can forget to.
 */
export function commit() {
  state.fromSeed = false;
  if (batching) return;
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

/**
 * Run several mutations as one undoable step.
 *
 * Pulling a task into a sprint can drag half a dependency chain with it. That
 * is one decision from where the user is standing, so it should be one press
 * of undo — not eleven.
 */
export function batch(fn) {
  if (batching) return fn();
  commit();
  batching = true;
  try { return fn(); } finally { batching = false; emit('structure'); }
}

export function undo() {
  const prev = undoStack.pop();
  if (!prev) return false;
  const data = JSON.parse(prev);
  state.buckets = data.buckets;
  state.edges = data.edges;
  state.sprints = data.sprints || [];
  if (data.columns) state.columns = data.columns;
  state.columns = data.columns || DEFAULT_COLUMNS.map((c) => ({ ...c }));
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

/** The one sprint currently being worked, if any. */
export const activeSprint = () => state.sprints.find((s) => s.status === 'active') || null;

/** Committed to the sprint that is actually running right now. */
export function isCommitted(item) {
  const active = activeSprint();
  return !!(active && item.sprintId === active.id);
}

/**
 * Whether a task's date falls inside the window it is committed to.
 *
 * `date` is when a thing happens; `sprintId` is when you promised to deal with
 * it. Those are different claims and they can disagree — a task dated three
 * weeks out sitting in this fortnight's sprint is a planning error worth
 * surfacing, not something to silently rewrite.
 */
export function dateFitsSprint(item, sprint) {
  if (!item.date || !sprint || !sprint.start || !sprint.end) return true;
  return item.date >= sprint.start && item.date <= sprint.end;
}

/** Everything live and not committed to a sprint. */
export const backlogItems = () =>
  allItems().filter(({ item }) => !item.sprintId && isLive(item));

/** Dropped work, for the times you want to look at what you decided against. */
export const droppedItems = () => allItems().filter(({ item }) => isDropped(item));

export const sprintItems = (sprintId) =>
  allItems().filter(({ item }) => item.sprintId === sprintId && isLive(item));

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
    id: newId('i'), title, date: null, status: 'todo', points: null, sprintId: null,
    notes: '', comments: [], ...extra,
  });
  emit('structure');
}

export function addComment(itemId, text) {
  const body = String(text || '').trim();
  if (!body) return;
  commit();
  const found = getItem(itemId);
  if (found) {
    if (!Array.isArray(found.item.comments)) found.item.comments = [];
    found.item.comments.push({ id: newId('c'), at: new Date().toISOString(), text: body });
  }
  emit('structure');
}

export function removeComment(itemId, commentId) {
  commit();
  const found = getItem(itemId);
  if (found && Array.isArray(found.item.comments)) {
    found.item.comments = found.item.comments.filter((c) => c.id !== commentId);
  }
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

/**
 * Decide against a task. It leaves the backlog and any sprint, and keeps
 * everything else — title, date, points, comments, connections — so the record
 * of what you chose and what you passed over stays intact.
 */
export function dropItem(id) {
  commit();
  const found = getItem(id);
  if (found) {
    found.item.status = DROPPED;
    found.item.droppedAt = new Date().toISOString();
    found.item.sprintId = null;
  }
  emit('structure');
}

/** Bring a dropped task back as unstarted work. */
export function restoreItem(id) {
  commit();
  const found = getItem(id);
  if (found && isDropped(found.item)) {
    found.item.status = 'todo';
    delete found.item.droppedAt;
  }
  emit('structure');
}

/* --------------------------------------------------------- columns */

export const getColumn = (id) => state.columns.find((c) => c.id === id);
export const isFixedColumn = (id) => FIXED_COLUMN_IDS.includes(id);

/**
 * Which column a task belongs in.
 *
 * Blocked is derived, not stored: a task with unfinished prerequisites belongs
 * there whether or not anyone dragged it. The manual case — `status: 'blocked'`
 * — exists for the blockers Runway cannot see, the ones that live in someone
 * else's inbox. Derived blocking only applies to work not yet started; if you
 * are actively on something, you are not blocked on it, whatever the graph says.
 */
export function laneOf(item) {
  if (item.status === DROPPED) return null;
  if (item.status === 'done') return 'done';
  if (item.status === 'blocked') return 'blocked';
  if (item.status === 'todo' && blockersFor(item.id).length) return 'blocked';
  return getColumn(item.status) ? item.status : 'todo';
}

/** True when the graph, not a person, is putting this task in Blocked. */
export const isDerivedBlocked = (item) =>
  item.status === 'todo' && blockersFor(item.id).length > 0;

export function addColumn(label) {
  const name = String(label || '').trim();
  if (!name) return null;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'column';
  let id = base;
  let n = 2;
  while (getColumn(id)) id = `${base}-${n++}`;
  commit();
  const column = { id, label: name, fixed: false };
  /* New columns land before Done, which is almost always where a new stage in
     someone's process actually goes. */
  const at = state.columns.findIndex((c) => c.id === 'done');
  if (at < 0) state.columns.push(column);
  else state.columns.splice(at, 0, column);
  emit('structure');
  return column;
}

export function renameColumn(id, label) {
  const name = String(label || '').trim();
  const column = getColumn(id);
  if (!name || !column) return;
  commit();
  column.label = name;
  emit('structure');
}

/**
 * Remove a column. The fixed four are refused — the rest of the app reasons
 * about them, and a board with no Done column could not close a sprint.
 * Anything sitting in a removed column returns to To do rather than vanishing.
 */
export function removeColumn(id) {
  if (isFixedColumn(id) || !getColumn(id)) return false;
  commit();
  state.columns = state.columns.filter((c) => c.id !== id);
  for (const b of state.buckets) {
    for (const item of b.items) if (item.status === id) item.status = 'todo';
  }
  emit('structure');
  return true;
}

export function moveColumn(id, delta) {
  const at = state.columns.findIndex((c) => c.id === id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= state.columns.length) return;
  commit();
  const [column] = state.columns.splice(at, 1);
  state.columns.splice(to, 0, column);
  emit('structure');
}

/**
 * Put a task in a column.
 *
 * Returns a refusal rather than silently doing nothing when the graph disagrees:
 * you cannot drag a task out of Blocked while it still has unfinished
 * prerequisites, because the column is computed and it would simply snap back.
 * The way out of derived Blocked is to finish the thing it is waiting on.
 */
export function setLane(itemId, columnId) {
  const found = getItem(itemId);
  if (!found || !getColumn(columnId)) return { ok: false };
  const { item } = found;

  if (columnId !== 'blocked' && columnId !== 'done' && isDerivedBlocked(item)) {
    const waiting = blockersFor(itemId).map((b) => b.item.title);
    return { ok: false, reason: `Still waiting on ${waiting.join(', ')}.` };
  }
  commit();
  item.status = columnId;
  if (columnId !== 'blocked') delete item.blockedReason;
  emit('structure');
  return { ok: true };
}

export function setBlockedReason(itemId, reason) {
  commit();
  const found = getItem(itemId);
  if (found) {
    const text = String(reason || '').trim();
    if (text) found.item.blockedReason = text;
    else delete found.item.blockedReason;
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
    if (item.status !== 'done' && isLive(item)) {
      item.sprintId = null;
      item.status = 'todo';
      returned += 1;
    }
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
      /* Defaults first, the saved fields over them, then the two that need
         repairing rather than defaulting: `status` folds in the old `done`
         boolean, and `comments` must end up an array even if an older board
         has no such field. */
      return {
        date: null,
        points: null,
        sprintId: null,
        notes: '',
        ...rest,
        status: rest.status || (done ? 'done' : 'todo'),
        comments: Array.isArray(rest.comments) ? rest.comments : [],
      };
    }),
  }));
  /* A board saved before columns existed gets the defaults. One saved with a
     partial set gets the missing fixed columns appended, so removing them by
     hand-editing an export cannot leave the app without a Done lane. */
  const saved = Array.isArray(data.columns) && data.columns.length
    ? data.columns.map((c) => ({ ...c, fixed: FIXED_COLUMN_IDS.includes(c.id) }))
    : DEFAULT_COLUMNS.map((c) => ({ ...c }));
  for (const fixed of DEFAULT_COLUMNS) {
    if (!saved.some((c) => c.id === fixed.id)) saved.push({ ...fixed });
  }

  return {
    buckets,
    edges: data.edges || [],
    sprints: data.sprints || [],
    columns: saved,
    world: data.world || state.world,
    currentSprint: data.currentSprint || null,
  };
}

/**
 * @param {object} data
 * @param {{fromSeed?: boolean, seedVersion?: number}} [origin]
 *        set when the board came from data/seed.js rather than from storage
 */
export function load(data, origin = {}) {
  const clean = normalize(data);
  state.buckets = clean.buckets;
  state.edges = clean.edges;
  state.sprints = clean.sprints;
  state.columns = clean.columns;
  state.world = clean.world;
  state.currentSprint = clean.currentSprint
    || state.sprints.find((s) => s.status === 'active')?.id
    || state.sprints[0]?.id
    || null;
  state.selectedEdge = null;
  state.fromSeed = origin.fromSeed ?? data.fromSeed ?? false;
  state.seedVersion = origin.seedVersion ?? data.seedVersion ?? null;
  emit('structure');
}

export const serialize = () => ({
  version: 2,
  savedAt: new Date().toISOString(),
  world: state.world,
  buckets: state.buckets,
  edges: state.edges,
  sprints: state.sprints,
  columns: state.columns,
  currentSprint: state.currentSprint,
  fromSeed: state.fromSeed,
  seedVersion: state.seedVersion,
});
