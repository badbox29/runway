/**
 * Seed board.
 *
 * Dance dates are taken from the DMA 2026–27 company calendar; the rest is an
 * ordinary autumn around them. The point of seeding with a real season is that
 * the interesting cases — a work deadline landing on a rehearsal night, two
 * optional competitions you can only pick one of — show up on their own.
 *
 * This file is the same shape as an exported board, so you can edit it by hand.
 */

let n = 0;
const id = (p) => `${p}${++n}`;

const item = (title, date = null) => ({ id: id('i'), title, date, done: false });

const bucket = (name, color, pattern, x, y, items) => ({
  id: id('b'), name, color, pattern, x, y, w: 222, collapsed: false, items,
});

const dance = bucket('Dance', '#C0326B', 'diagonal', 90, 90, [
  item('Specialty rehearsal', '2026-08-28'),
  item('Fall show performances', '2026-08-30'),
  item('Costume payment due', '2026-09-04'),
  item('Confirm Comp #2 roster', '2026-09-18'),
  item('Book Chattanooga hotel'),
  item('Nutcracker rehearsal 1 of 4', '2026-10-16'),
  item('Optional comp — Duluth', '2027-01-29'),
  item('Optional comp — Jonesboro', '2027-02-19'),
  item('Ask about carpool'),
]);

const school = bucket('School', '#1F7A8C', 'dots', 470, 140, [
  item('Back-to-school night', '2026-08-31'),
  item('Picture day order form', '2026-09-08'),
  item('Progress reports', '2026-09-15'),
  item('Field trip slip', '2026-10-06'),
]);

const work = bucket('Work', '#4A3E9C', 'crosshatch', 840, 90, [
  item('Q3 planning doc due', '2026-08-28'),
  item('Team offsite', '2026-09-02'),
  item('1:1 with Dana', '2026-09-10'),
  item('Budget review', '2026-10-01'),
]);

const home = bucket('Home', '#A8641F', 'rules', 470, 470, [
  item('Grocery run', '2026-08-29'),
  item('HVAC filter', '2026-09-05'),
  item('Car inspection', '2026-09-12'),
]);

const health = bucket('Health', '#2E7148', 'weave', 90, 560, [
  item('Dentist, 4:00', '2026-09-03'),
  item('Annual physical', '2026-09-09'),
]);

const buckets = [dance, school, work, home, health];

const find = (b, title) => ({ kind: 'item', id: b.items.find((i) => i.title === title).id });
const whole = (b) => ({ kind: 'bucket', id: b.id });

const edge = (type, from, to, behind = false) => ({ id: id('e'), type, from, to, behind });

const edges = [
  edge('depends', find(dance, 'Book Chattanooga hotel'), find(dance, 'Confirm Comp #2 roster')),
  edge('blocks', find(dance, 'Nutcracker rehearsal 1 of 4'), find(dance, 'Costume payment due')),
  edge('either', find(dance, 'Optional comp — Duluth'), find(dance, 'Optional comp — Jonesboro')),
  edge('clash', find(work, 'Q3 planning doc due'), find(dance, 'Specialty rehearsal')),
  edge('bundle', find(home, 'Car inspection'), find(health, 'Dentist, 4:00'), true),
  edge('waiting', find(dance, 'Ask about carpool'), find(school, 'Back-to-school night')),
  edge('informs', find(school, 'Field trip slip'), find(home, 'Grocery run')),
  edge('clash', whole(work), whole(dance), true),
];

export const SEED = {
  version: 1,
  world: { w: 3200, h: 2200 },
  buckets,
  edges,
};
