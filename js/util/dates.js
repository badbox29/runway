/** Dates are stored as ISO 'YYYY-MM-DD' strings. Formatting lives here. */

export const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
export const DOW = ['S','M','T','W','T','F','S'];

export const isoOf = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Compact form for a bucket row: 8/28 */
export function shortDate(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Readable form for a day heading: Aug 28 */
export function longDate(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
export function firstDow(y, m) { return new Date(y, m, 1).getDay(); }
