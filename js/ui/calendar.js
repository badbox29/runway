/**
 * Month view.
 *
 * Three fields describe when a task sits in time, and they answer different
 * questions. The calendar's job is to keep them distinguishable:
 *
 *   date      when the thing happens. A fact about the world.
 *   sprintId  when you promised to deal with it. A fact about your plan.
 *   status    whether it is finished.
 *
 * So: completing a task takes it off the calendar but never touches its date —
 * the date is history, and it comes straight back if you reopen the task. The
 * running sprint is drawn as a band across the days it covers, and tasks
 * committed to it are drawn ringed while everything else stays plain. That is
 * the difference between "this is happening on the 12th" and "I have signed up
 * to deal with this by the 14th", which is the distinction the two views exist
 * to hold apart.
 *
 * Days carry no event text — only the date number and a stack of textured bars.
 * You read the shape of a month before you read a single word. Text arrives
 * when you pick a day.
 */
import { state, scheduledByDate, activeSprint, sprintItems, isDropped, emit } from '../core/store.js';
import { fillCSS } from '../util/patterns.js';
import { MONTHS, DOW, isoOf, longDate, daysInMonth, firstDow } from '../util/dates.js';
import { el, $, clear } from '../util/dom.js';
import { openDetail } from './detail.js';

const MAX_BARS = 3;

/** View state, not board state: a display filter is not part of the data. */
const view = { showDone: false };

let root;

export function initCalendar() {
  root = $('#calendar');
  if (!state.calendar.selected) {
    const today = new Date();
    state.calendar.selected = isoOf(today.getFullYear(), today.getMonth(), today.getDate());
  }
}

export function renderCalendar() {
  if (!root || root.hidden) return;
  const { year, month, selected } = state.calendar;
  const sprint = activeSprint();
  const byDate = scheduledByDate();
  const todayIso = (() => {
    const d = new Date();
    return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
  })();

  clear(root);
  const wrap = el('div', { class: 'cal-wrap' });

  /* ---------------- header ---------------- */
  const prev = el('button', { class: 'cal-nav', 'aria-label': 'Previous month', html: '&larr;' });
  const next = el('button', { class: 'cal-nav', 'aria-label': 'Next month', html: '&rarr;' });
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));

  const doneToggle = el('button', {
    class: `tool${view.showDone ? ' on' : ''}`,
    text: view.showDone ? 'Hiding nothing' : 'Show completed',
    title: 'Completed tasks keep their date but leave the calendar',
  });
  doneToggle.addEventListener('click', () => { view.showDone = !view.showDone; renderCalendar(); });

  wrap.appendChild(el('div', { class: 'cal-head' }, [
    prev,
    el('h2', {}, [
      document.createTextNode(`${MONTHS[month]} `),
      el('span', { class: 'yr', text: String(year) }),
    ]),
    el('span', { class: 'spacer' }),
    doneToggle,
    next,
  ]));

  if (sprint) {
    wrap.appendChild(el('div', { class: 'cal-sprint' }, [
      el('span', { class: 'cal-band-key' }),
      el('span', {
        text: `${sprint.name} · ${longDate(sprint.start)} – ${longDate(sprint.end)}`,
      }),
    ]));
  }

  /* ---------------- grid ---------------- */
  wrap.appendChild(el('div', { class: 'cal-dow' }, DOW.map((d) => el('div', { text: d }))));

  const grid = el('div', { class: 'cal-grid' });
  const lead = firstDow(year, month);
  const total = daysInMonth(year, month);
  for (let i = 0; i < lead; i++) grid.appendChild(el('div', { class: 'cal-cell empty' }));

  for (let day = 1; day <= total; day++) {
    const iso = isoOf(year, month, day);
    /* Dropped work is not happening, so it leaves the calendar outright — the
       date is kept on the task, not shown here. */
    const all = (byDate.get(iso) || []).filter(({ item }) => !isDropped(item));
    const shown = view.showDone ? all : all.filter(({ item }) => item.status !== 'done');
    const hidden = all.length - shown.length;

    const inWindow = !!(sprint && sprint.start && sprint.end && iso >= sprint.start && iso <= sprint.end);
    const overdue = iso < todayIso && shown.some(({ item }) => item.status !== 'done');

    const classes = ['cal-cell'];
    if (shown.length) classes.push('has');
    if (iso === selected) classes.push('sel');
    if (inWindow) classes.push('in-sprint');
    if (iso === sprint?.start) classes.push('sprint-start');
    if (iso === sprint?.end) classes.push('sprint-end');
    if (iso === todayIso) classes.push('today');
    if (overdue) classes.push('overdue');

    const bars = el('span', { class: 'bars' });
    for (const { item, bucket } of shown.slice(0, MAX_BARS)) {
      bars.appendChild(el('span', {
        class: `bar${item.sprintId && item.sprintId === sprint?.id ? ' committed' : ''}${item.status === 'done' ? ' done' : ''}`,
        style: fillCSS(bucket.color, bucket.pattern, 0.8),
      }));
    }
    if (shown.length > MAX_BARS) {
      bars.appendChild(el('span', { class: 'more', text: `+${shown.length - MAX_BARS}` }));
    }

    const cell = el('button', {
      class: classes.join(' '),
      title: hidden ? `${hidden} completed hidden` : '',
    }, [
      el('span', { class: 'n', text: String(day) }),
      bars,
    ]);
    cell.addEventListener('click', () => { state.calendar.selected = iso; emit('view'); });
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);

  /* ---------------- the picked day ---------------- */
  const all = (byDate.get(selected) || []).filter(({ item }) => !isDropped(item));
  const shown = view.showDone ? all : all.filter(({ item }) => item.status !== 'done');
  const hidden = all.length - shown.length;

  const day = el('div', { class: 'cal-day' }, [el('h3', { text: longDate(selected) })]);
  if (!shown.length) {
    day.appendChild(el('p', {
      class: 'cal-empty',
      text: hidden ? `Nothing open. ${hidden} completed ${hidden === 1 ? 'task' : 'tasks'} kept this date.` : 'Nothing scheduled.',
    }));
  } else {
    for (const entry of shown) day.appendChild(dayRow(entry, sprint));
    if (hidden) {
      day.appendChild(el('p', {
        class: 'cal-empty',
        text: `${hidden} completed ${hidden === 1 ? 'task' : 'tasks'} hidden — the date is kept.`,
      }));
    }
  }
  wrap.appendChild(day);

  /* ---------------- committed but unplaced ----------------
     Sprint work with no date has nowhere to sit in a month grid, and silently
     omitting it makes the calendar look emptier than the fortnight really is.
     Listing it here turns the calendar into the place you schedule it. */
  if (sprint) {
    const undated = sprintItems(sprint.id)
      .filter(({ item }) => !item.date && item.status !== 'done');
    if (undated.length) {
      const box = el('div', { class: 'cal-unplaced' }, [
        el('h3', { text: `Committed, no date · ${undated.length}` }),
        el('p', { class: 'cal-empty', text: `In ${sprint.name} but not on the calendar. Open one to give it a day.` }),
      ]);
      for (const entry of undated) box.appendChild(dayRow(entry, sprint));
      wrap.appendChild(box);
    }
  }

  root.appendChild(wrap);
}

function dayRow({ item, bucket }, sprint) {
  const committed = !!(sprint && item.sprintId === sprint.id);
  const line = el('div', {
    class: `cal-item${committed ? ' committed' : ''}${item.status === 'done' ? ' done' : ''}`,
  }, [
    el('span', { class: 'sw', style: fillCSS(bucket.color, bucket.pattern, 1) }),
    el('span', { class: 'cal-item-text', text: item.title }),
    committed ? el('span', { class: 'cal-tag', text: 'sprint' }) : null,
    el('span', { class: 'bk', text: bucket.name }),
  ]);
  line.addEventListener('click', () => openDetail(item.id));
  return line;
}

function step(delta) {
  let { year, month } = state.calendar;
  month += delta;
  if (month < 0) { month = 11; year -= 1; }
  if (month > 11) { month = 0; year += 1; }
  state.calendar.year = year;
  state.calendar.month = month;
  emit('view');
}
