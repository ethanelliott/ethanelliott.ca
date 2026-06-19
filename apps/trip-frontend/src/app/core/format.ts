// Formatting helpers for calendar-date strings (YYYY-MM-DD). These avoid
// `new Date('YYYY-MM-DD')`, which parses as UTC midnight and can shift the
// day backwards in western timezones.

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Jun 3, 2026" from "2026-06-03". */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "Jun 3 – Jun 12, 2026", collapsing shared year/month where possible. */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start && !end) return 'No dates yet';
  if (!start) return formatDate(end);
  if (!end) return formatDate(start);

  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);

  if (sy === ey && sm === em && sd === ed) return formatDate(start);
  if (sy === ey && sm === em) {
    return `${MONTHS[sm - 1]} ${sd} – ${ed}, ${sy}`;
  }
  if (sy === ey) {
    return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}, ${sy}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}
