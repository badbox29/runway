/**
 * Month view.
 *
 * Same data, read differently. Days carry no event text — only the date number
 * and a stack of patterned bars. You read the shape of a month before you read
 * a single word, and a week with four magenta stripes is recognisably
 * Nutcracker week. Text arrives when you tap a day.
 */
import { state, scheduledByDate, emit } from '../core/store.js';
import { fillCSS } from '../util/patterns.js';
import { MONTHS, DOW, isoOf, longDate, daysInMonth, firstDow } from '../util/dates.js';
import { el, $, clear } from '../util/dom.js';
import { openItemMenu } from './popover.js';

const MAX_BARS = 3;
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
  const byDate = scheduledByDate();

  clear(root);
  const wrap = el('div', { class: 'cal-wrap' });

  /* header */
  const prev = el('button', { class: 'cal-nav', 'aria-label': 'Previous month', html: '&larr;' });
  const next = el('button', { class: 'cal-nav', 'aria-label': 'Next month', html: '&rarr;' });
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  wrap.appendChild(el('div', { class: 'cal-head' }, [
    prev,
    el('h2', {}, [
      document.createTextNode(`${MONTHS[month]} `),
      el('span', { class: 'yr', text: String(year) }),
    ]),
    next,
  ]));

  /* day-of-week strip */
  wrap.appendChild(el('div', { class: 'cal-dow' }, DOW.map((d) => el('div', { text: d }))));

  /* grid */
  const grid = el('div', { class: 'cal-grid' });
  const lead = firstDow(year, month);
  const total = daysInMonth(year, month);
  for (let i = 0; i < lead; i++) grid.appendChild(el('div', { class: 'cal-cell empty' }));

  for (let day = 1; day <= total; day++) {
    const iso = isoOf(year, month, day);
    const entries = byDate.get(iso) || [];
    const cell = el('button', {
      class: `cal-cell${entries.length ? ' has' : ''}${iso === selected ? ' sel' : ''}`,
    }, [
      el('span', { class: 'n', text: String(day) }),
      el('span', { class: 'bars' }, [
        ...entries.slice(0, MAX_BARS).map(({ bucket }) =>
          el('span', { class: 'bar', style: fillCSS(bucket.color, bucket.pattern, 0.8) })),
        entries.length > MAX_BARS
          ? el('span', { class: 'more', text: `+${entries.length - MAX_BARS}` })
          : null,
      ]),
    ]);
    cell.addEventListener('click', () => {
      state.calendar.selected = iso;
      emit('view');
    });
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);

  /* selected day */
  const entries = byDate.get(selected) || [];
  const day = el('div', { class: 'cal-day' }, [el('h3', { text: longDate(selected) })]);
  if (!entries.length) {
    day.appendChild(el('p', { class: 'cal-empty', text: 'Nothing scheduled.' }));
  } else {
    for (const { item, bucket } of entries) {
      const line = el('div', { class: 'cal-item' }, [
        el('span', { class: 'sw', style: fillCSS(bucket.color, bucket.pattern, 1) }),
        el('span', { style: 'flex:1', text: item.title }),
        el('span', { class: 'bk', text: bucket.name }),
      ]);
      line.addEventListener('click', (e) => openItemMenu(e.clientX, e.clientY, item, bucket));
      day.appendChild(line);
    }
  }
  wrap.appendChild(day);
  root.appendChild(wrap);
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
