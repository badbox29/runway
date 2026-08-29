/**
 * Demo board.
 *
 * A generic few months of work, home, and life — dense enough to be worth
 * looking at and to shake out the parts of the UI that only misbehave under
 * load: calendar days with more events than fit, tall buckets, connections
 * that have to route through a crowded canvas, and sprints with real history.
 *
 * Three things are computed rather than written down:
 *
 *   Dates      are offsets from today, so the calendar always opens on a month
 *              with something in it, whoever clones this and whenever.
 *   Status     defaults to done for anything in the past. Overdue tasks are the
 *              interesting exception, so those are marked todo explicitly.
 *   Layout     bucket x/y are assigned by a balanced column pass at the bottom
 *              of this file, so adding a task never silently overlaps two cards.
 *
 * This file produces the same shape a board export does, so you can replace it
 * wholesale with an export, or delete it and start empty.
 */

let n = 0;
const id = (p) => `${p}${++n}`;

/* Refs let connections point at tasks by a stable name instead of by title,
   which matters once several buckets each have a task called "Renew". */
const refs = new Map();

/* ------------------------------------------------------------------ dates */

function inDays(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ------------------------------------------------------------------ tasks */

/**
 * @param {string} title
 * @param {number|null} offset  days from today, or null for undated
 * @param {object} extra        ref, status, points, sprintId
 */
function task(title, offset = null, extra = {}) {
  const { ref, comments = [], ...rest } = extra;
  const item = {
    id: id('i'),
    title,
    date: offset === null ? null : inDays(offset),
    status: offset !== null && offset < 0 ? 'done' : 'todo',
    points: null,
    sprintId: null,
    notes: '',
    comments: comments.map((text, i) => ({
      id: id('c'),
      at: new Date(Date.now() - (comments.length - i) * 36e5).toISOString(),
      text,
    })),
    ...rest,
  };
  if (ref) {
    if (refs.has(ref)) throw new Error(`Duplicate seed ref: ${ref}`);
    refs.set(ref, item.id);
  }
  return item;
}

/** A repeating commitment. These are what make the calendar look like a life. */
function series(title, { from, count, every = 7, ...extra }) {
  return Array.from({ length: count }, (_, i) => task(title, from + i * every, extra));
}

const bucket = (name, color, pattern, items, extra = {}) => ({
  id: id('b'), name, color, pattern, x: 0, y: 0, w: 222, collapsed: false, items, ...extra,
});

/* ------------------------------------------------------------------------ */
/*  Buckets                                                                  */
/* ------------------------------------------------------------------------ */

const work = bucket('Work', '#4A3E9C', 'crosshatch', [
  task('Migrate CI runners', -16, { points: 5, sprintId: 's-2back' }),
  task('Postmortem: cache outage', -9, { points: 3, sprintId: 's-last' }),
  task('Onboard the new designer', -5, { points: 2, sprintId: 's-last' }),
  task('Send the vendor W-9', -2, { status: 'todo', points: 1, ref: 'w9' }),
  task('Reply to Priya', 0, { status: 'done', points: 1, sprintId: 's-now' }),
  task('Team offsite', 3, { status: 'doing', points: 2, sprintId: 's-now' }),
  task('Get receipt from Sam', 4, { status: 'doing', points: 1, sprintId: 's-now', ref: 'receipt' }),
  task('Draft pricing page', 5, {
    points: 5, sprintId: 's-now', ref: 'pricing-page',
    notes: 'Three tiers, annual toggle. Reuse the comparison table from the deck.',
    comments: [
      'Priya wants the enterprise tier above the fold.',
      'Blocked on the research read — holding until that lands.',
    ],
  }),
  task('Interview loop — backend', 6, { points: 2, sprintId: 's-now', ref: 'loop' }),
  task('Interview debrief', 7, { points: 1, sprintId: 's-now', ref: 'debrief' }),
  task('Submit expenses', 7, { points: 2, sprintId: 's-now', ref: 'expenses' }),
  task('Legal sign-off', 9, { points: 3, sprintId: 's-next', ref: 'legal' }),
  task('Ship the redesign', 12, {
    points: 8, sprintId: 's-next', ref: 'ship',
    notes: 'Staged rollout: 10% for a day, then everyone.',
    comments: ['Legal sign-off is the only real gate left.'],
  }),
  task('Security training', 14, { points: 1 }),
  task('Update the runbook', 18, { points: 2 }),
  task('Quarterly review', 21, { points: 5, sprintId: 's-later', ref: 'qreview' }),
  task('Write Q4 goals', 24, { points: 3, sprintId: 's-later', ref: 'goals' }),
  task('Renew vendor contract', 30, { points: 2 }),
  task('Archive dormant repos', 44, { points: 1 }),
  task('Clean up the on-call rota'),
  ...series('1:1 with Dana', { from: -14, count: 8, every: 7, points: 1 }),
]);

const home = bucket('Home', '#A8641F', 'rules', [
  task('Call about the fence quote', -3, { status: 'todo', points: 1, ref: 'fence-quote' }),
  task('Post office run', 2, { points: 1, sprintId: 's-now', ref: 'post-office' }),
  task('Hardware store', 2, { points: 1, sprintId: 's-now', ref: 'hardware' }),
  task('Buy a new bulb', 1, { points: 1, ref: 'bulb' }),
  task('Fix the porch light', null, { points: 2, ref: 'porch' }),
  task('HVAC filter', 5, { points: 1 }),
  task('Car inspection', 11, { points: 2, ref: 'inspection' }),
  task('Renew car registration', 16, { points: 2, ref: 'registration' }),
  task('Gutter cleaning', 27, { points: 3 }),
  task('Replace smoke detector batteries', 33, { points: 1 }),
  task('Fence installation', 35, { points: 3, ref: 'fence' }),
  task('Deep clean the garage', null, { points: 5 }),
  task('Order a new doormat'),
  ...series('Trash night', { from: -14, count: 10, every: 7 }),
  ...series('Water the plants', { from: -6, count: 12, every: 3 }),
]);

const health = bucket('Health', '#2E7148', 'weave', [
  task('Dentist', 3, { points: 1, sprintId: 's-now', ref: 'dentist' }),
  task('Refill prescription', 8, { points: 1, ref: 'refill' }),
  task('Bloodwork', 11, { points: 1, ref: 'bloodwork' }),
  task('Annual physical', 18, { points: 2, ref: 'physical' }),
  task('Flu shot', 25, { points: 1 }),
  task('Optometrist', 45, { points: 1 }),
  task('Book physio', null, { points: 1 }),
  ...series('Swim', { from: -18, count: 13, every: 3 }),
]);

const learning = bucket('Learning', '#1F7A8C', 'dots', [
  task('Read pricing research', 1, { status: 'done', points: 2, sprintId: 's-now', ref: 'research' }),
  task('Finish course module 4', 6, { points: 3, sprintId: 's-now', ref: 'module4' }),
  task('Course module 5', 13, { points: 3, ref: 'module5' }),
  task('Course module 6', 20, { points: 3, ref: 'module6' }),
  task('Draft talk outline', 22, { points: 5, ref: 'talk-outline' }),
  task('Conference CFP deadline', 29, { points: 3, ref: 'cfp' }),
  task('Read "Thinking in Systems"', null, { points: 5 }),
  ...series('Practice guitar', { from: -10, count: 12, every: 2 }),
  ...series('Spanish lesson', { from: -7, count: 7, every: 7, points: 1 }),
]);

const family = bucket('Family', '#C0326B', 'diagonal', [
  task('Sign the permission slip', -1, { status: 'todo', points: 1, ref: 'slip' }),
  task('Confirm headcount', 8, { points: 1, ref: 'headcount' }),
  task('Parent–teacher conference', 9, { points: 1, ref: 'ptc' }),
  task('Book the venue', 10, { points: 2, ref: 'venue' }),
  task('Order the cake', 14, { points: 1, ref: 'cake' }),
  task("Nora's birthday party", 17, { points: 3, ref: 'party' }),
  task('Renew passports', 31, { points: 3, ref: 'passports' }),
  task('Family photos', 38, { points: 2 }),
  task('Plan the summer trip', null, { points: 8, ref: 'trip' }),
  ...series('School pickup', { from: -12, count: 9, every: 7 }),
  ...series('Call Mom', { from: -7, count: 7, every: 7 }),
]);

const finance = bucket('Finance', '#8A2E7A', 'rules', [
  task('Gather receipts', 12, { points: 3, ref: 'receipts' }),
  task('File quarterly taxes', 19, { points: 5, ref: 'taxes' }),
  task('Rebalance the portfolio', 26, { points: 3 }),
  task('Insurance renewal', 41, { points: 2 }),
  task('Cancel unused subscriptions', null, { points: 2 }),
  task('Open the college fund', null, { points: 3, ref: 'college-fund' }),
  ...series('Pay rent', { from: -30, count: 4, every: 30, points: 1 }),
  ...series('Review the budget', { from: -14, count: 8, every: 7, points: 1 }),
]);

const project = bucket('Side project', '#0F6E6E', 'diagonal', [
  task('Pick a colour scheme', 2, { status: 'doing', points: 2, sprintId: 's-now', ref: 'scheme' }),
  task('Fix the mobile layout bug', 6, { points: 3, sprintId: 's-now', ref: 'mobile-bug' }),
  task('Ask Jo to review the copy', 7, { points: 1, ref: 'jo' }),
  task('Set up analytics', 9, { points: 2, ref: 'analytics' }),
  task('Add dark mode', 13, { points: 5, ref: 'darkmode' }),
  task('Domain renewal', 15, { points: 1 }),
  task('Write the launch post', 23, { points: 3, ref: 'launch-post' }),
  task('Launch', 28, { points: 5, ref: 'launch' }),
  task('Rewrite the landing page', null, { points: 8, ref: 'landing' }),
  task('Commission a logo', null, { points: 2, ref: 'logo' }),
]);

const social = bucket('Social', '#7A5C12', 'dots', [
  task('Reply to the group chat', 0, { points: 1 }),
  task('Coffee with Marcus', 2, { points: 1 }),
  task('Sunday hike', 4, { ref: 'hike' }),
  task('Sunday matinee', 4, { ref: 'matinee' }),
  task('Dinner with the Hallorans', 6, { points: 2 }),
  task('Send Dad a birthday card', 10, { points: 1 }),
  task('Book a table for the anniversary', 20, { points: 2, ref: 'table' }),
  task('Anniversary', 34, { ref: 'anniversary' }),
  ...series('Book club', { from: -28, count: 4, every: 28 }),
]);

const buckets = [work, home, health, learning, family, finance, project, social];

/* ------------------------------------------------------------------------ */
/*  Connections                                                              */
/* ------------------------------------------------------------------------ */

const at = (key) => {
  if (!refs.has(key)) throw new Error(`Unknown seed ref: ${key}`);
  return { kind: 'item', id: refs.get(key) };
};
const whole = (b) => ({ kind: 'bucket', id: b.id });
const link = (type, from, to, behind = false) => ({ id: id('e'), type, from, to, behind });

const edges = [
  /* depends on — sequencing */
  link('depends', at('venue'), at('headcount')),
  link('depends', at('party'), at('cake')),
  link('depends', at('physical'), at('bloodwork')),
  link('depends', at('debrief'), at('loop')),
  link('depends', at('module5'), at('module4')),
  link('depends', at('module6'), at('module5')),
  link('depends', at('taxes'), at('receipts')),
  link('depends', at('launch'), at('launch-post')),
  link('depends', at('cfp'), at('talk-outline')),
  link('depends', at('registration'), at('inspection')),

  /* blocks — hard stops */
  link('blocks', at('ship'), at('legal')),
  link('blocks', at('fence'), at('fence-quote')),
  link('blocks', at('expenses'), at('w9')),
  link('blocks', at('trip'), at('passports')),

  /* waiting on — the dependency is a person */
  link('waiting', at('expenses'), at('receipt')),
  link('waiting', at('launch-post'), at('jo')),
  link('waiting', at('ptc'), at('slip')),

  /* either / or — pick one */
  link('either', at('hike'), at('matinee')),
  link('either', at('logo'), at('landing')),

  /* conflicts — same slot */
  link('clash', at('dentist'), at('post-office')),
  link('clash', at('bloodwork'), at('inspection')),
  link('clash', whole(work), whole(family), true),

  /* do together — one trip, one sitting */
  link('bundle', at('post-office'), at('hardware')),
  link('bundle', at('bulb'), at('porch')),
  link('bundle', at('inspection'), at('refill'), true),
  link('bundle', at('receipts'), at('college-fund'), true),

  /* informs — changes how you'd do the other */
  link('informs', at('research'), at('pricing-page')),
  link('informs', at('scheme'), at('darkmode')),
  link('informs', at('analytics'), at('launch')),
  link('informs', at('goals'), at('qreview'), true),
  link('informs', at('mobile-bug'), at('landing')),
];

/* ------------------------------------------------------------------------ */
/*  Sprints                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Five sprints: two closed, one running, two queued. The running one is
 * deliberately untidy — several of its cards have unfinished prerequisites, so
 * the blocker dots on the sprint board have something to say on first load.
 */
const sprints = [
  { id: 's-2back', name: 'Two sprints ago', start: inDays(-32), end: inDays(-19), status: 'done' },
  { id: 's-last', name: 'Last sprint', start: inDays(-18), end: inDays(-5), status: 'done' },
  { id: 's-now', name: 'This fortnight', start: inDays(-4), end: inDays(9), status: 'active' },
  { id: 's-next', name: 'Next up', start: inDays(10), end: inDays(23), status: 'planned' },
  { id: 's-later', name: 'Later', start: inDays(24), end: inDays(37), status: 'planned' },
];

/* ------------------------------------------------------------------------ */
/*  Layout                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Place buckets in balanced columns.
 *
 * Card height is a function of item count, so hand-written coordinates go stale
 * the moment anyone adds a task. This drops each bucket into whichever column
 * is currently shortest, which keeps the board tidy and — more usefully for
 * testing — guarantees clear gutters for the connection router to find.
 */
const COLUMNS = 4;
const COL_X = 320;      /* 222px card + 98px gutter */
const ROW_GAP = 44;
const ORIGIN = { x: 90, y: 90 };
const METRICS = { strip: 7, head: 27, row: 26, foot: 22 };

const heightOf = (b) =>
  METRICS.strip + METRICS.head + (b.collapsed ? 0 : b.items.length * METRICS.row + METRICS.foot);

function layout(list) {
  const bottoms = new Array(COLUMNS).fill(ORIGIN.y);
  for (const b of list) {
    let col = 0;
    for (let i = 1; i < COLUMNS; i++) if (bottoms[i] < bottoms[col]) col = i;
    b.x = ORIGIN.x + col * COL_X;
    b.y = bottoms[col];
    bottoms[col] = b.y + heightOf(b) + ROW_GAP;
  }
  return {
    w: ORIGIN.x + COLUMNS * COL_X + 700,
    h: Math.max(...bottoms) + 700,
  };
}

const world = layout(buckets);

/**
 * Bump `seedVersion` whenever you change this file.
 *
 * On boot, a saved board that is still the untouched demo and carries an older
 * generation is replaced by this one. A board anyone has actually edited is
 * never replaced, whatever this number says.
 */
export const SEED = {
  version: 2,
  seedVersion: 4,
  world,
  buckets,
  edges,
  sprints,
  currentSprint: 's-now',
};
