// Timezone math for the schedule grid. Activities are stored as UTC instants;
// each day column is a calendar date rendered in a specific IANA zone. These
// helpers convert between UTC instants and "wall-clock minutes from midnight"
// in a given zone, and back, handling DST correctly.

export interface ZonedParts {
  /** Wall-clock calendar date in the zone, YYYY-MM-DD. */
  date: string;
  /** Minutes from local midnight (0–1439). */
  minutes: number;
}

function partsOf(date: Date, tz: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    year: +p['year'],
    month: +p['month'],
    day: +p['day'],
    hour: +p['hour'],
    minute: +p['minute'],
    second: +p['second'],
  };
}

/** Wall-clock date + minutes-from-midnight for a UTC instant in a zone. */
export function zonedParts(date: Date, tz: string): ZonedParts {
  const p = partsOf(date, tz);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return {
    date: `${p.year}-${mm}-${dd}`,
    minutes: p.hour * 60 + p.minute,
  };
}

/** Offset (local − UTC) in minutes for a zone at a given instant. */
export function tzOffsetMinutes(tz: string, date: Date): number {
  const p = partsOf(date, tz);
  const asUTC = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

/**
 * The UTC instant for a wall-clock time (date + minutes-from-midnight) in a
 * zone. Refines once to settle DST boundaries.
 */
export function zonedTimeToUtc(
  date: string,
  minutes: number,
  tz: string
): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let offset = tzOffsetMinutes(tz, new Date(guess));
  let utc = guess - offset * 60000;
  offset = tzOffsetMinutes(tz, new Date(utc));
  utc = guess - offset * 60000;
  return new Date(utc);
}

/** Short zone label like "CEST" / "EDT" for an instant. */
export function tzAbbreviation(tz: string, date: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'short',
    hour: '2-digit',
  });
  const part = fmt.formatToParts(date).find((p) => p.type === 'timeZoneName');
  return part?.value ?? tz;
}

/** Add days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Inclusive list of YYYY-MM-DD dates between start and end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  // Guard against pathological ranges.
  for (let i = 0; i < 1000 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Format minutes-from-midnight as "HH:MM" (24h). */
export function formatMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
