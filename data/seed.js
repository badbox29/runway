/**
 * Demo board.
 *
 * A generic week of work, home, and life — enough to show every connection
 * type in use and to give the calendar something to draw. Delete it and start
 * empty, or replace it with an exported board; this file is the same shape a
 * board export produces, so it can be swapped wholesale.
 *
 * Dates are computed relative to today rather than hard-coded, so the calendar
 * always opens on a month with something in it.
 */

let n = 0;
const id = (p) => `${p}${++n}`;

/** ISO date this many days from today. */
function inDays(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const item = (title, offset = null) => ({
  id: id('i'),
  title,
  date: offset === null ? null : inDays(offset),
  done: false,
});

const bucket = (name, color, pattern, x, y, items) => ({
  id: id('b'), name, color, pattern, x, y, w: 222, collapsed: false, items,
});

const work = bucket('Work', '#4A3E9C', 'crosshatch', 90, 90, [
  item('Reply to Priya', 0),
  item('Team offsite', 3),
  item('Get receipt from Sam', 4),
  item('Draft pricing page', 5),
  item('Submit expenses', 7),
  item('Legal sign-off', 9),
  item('Ship the redesign', 12),
  item('Quarterly review', 21),
]);

const learning = bucket('Learning', '#1F7A8C', 'dots', 470, 120, [
  item('Read pricing research', 1),
  item('Finish course module 4', 6),
  item('Practice guitar'),
]);

const home = bucket('Home', '#A8641F', 'rules', 840, 90, [
  item('Post office run', 2),
  item('Hardware store', 2),
  item('Fix the porch light'),
  item('Renew car registration', 16),
]);

const weekend = bucket('Weekend', '#C0326B', 'diagonal', 470, 440, [
  item('Sunday hike', 4),
  item('Sunday matinee', 4),
  item('Confirm headcount', 8),
  item('Book the venue', 10),
]);

const health = bucket('Health', '#2E7148', 'weave', 90, 560, [
  item('Dentist', 3),
  item('Annual physical', 18),
  item('Swim, Tue and Thu'),
]);

const buckets = [work, learning, home, weekend, health];

const find = (b, title) => ({ kind: 'item', id: b.items.find((i) => i.title === title).id });
const whole = (b) => ({ kind: 'bucket', id: b.id });
const edge = (type, from, to, behind = false) => ({ id: id('e'), type, from, to, behind });

const edges = [
  edge('depends', find(weekend, 'Book the venue'), find(weekend, 'Confirm headcount')),
  edge('blocks', find(work, 'Ship the redesign'), find(work, 'Legal sign-off')),
  edge('either', find(weekend, 'Sunday hike'), find(weekend, 'Sunday matinee')),
  edge('clash', find(work, 'Team offsite'), find(health, 'Dentist')),
  edge('bundle', find(home, 'Post office run'), find(home, 'Hardware store')),
  edge('waiting', find(work, 'Submit expenses'), find(work, 'Get receipt from Sam')),
  edge('informs', find(learning, 'Read pricing research'), find(work, 'Draft pricing page')),
  edge('clash', whole(work), whole(weekend), true),
];

export const SEED = {
  version: 1,
  world: { w: 3200, h: 2200 },
  buckets,
  edges,
};
