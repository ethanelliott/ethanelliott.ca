import { Segment } from './models';
import { addDays, dateRange, zonedParts } from './tz';

export interface ScheduleColumn {
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  /** IANA timezone resolved for this day. */
  tz: string;
  /** Segment colour for the day, if any. */
  color: string | null;
  /** Segment city for the day, if any. */
  city: string | null;
}

/**
 * Build the day columns for a trip from its segments: a continuous run of
 * calendar dates from the earliest segment start to the latest end, each
 * resolved to the timezone/colour of the segment that contains it.
 */
export function resolveColumns(
  segments: Segment[],
  homeTz: string
): ScheduleColumn[] {
  if (segments.length === 0) return [];

  const start = segments.reduce(
    (min, s) => (s.startDate < min ? s.startDate : min),
    segments[0].startDate
  );
  const end = segments.reduce(
    (max, s) => (s.endDate > max ? s.endDate : max),
    segments[0].endDate
  );

  return dateRange(start, end).map((date) => {
    // Prefer the segment with the latest start that still contains the date.
    const containing = segments
      .filter((s) => s.startDate <= date && date <= s.endDate)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    const seg = containing[containing.length - 1];
    return {
      date,
      tz: seg?.timezone ?? homeTz,
      color: seg?.color ?? null,
      city: seg?.city ?? null,
    };
  });
}

export interface ActivityPiece {
  /** Index into the column list. */
  colIndex: number;
  /** Minutes from midnight where the piece starts (in the display zone). */
  startMin: number;
  /** Minutes from midnight where the piece ends. */
  endMin: number;
  /** True when this is the first (top) piece of the activity. */
  isStart: boolean;
  /** True when this is the last (bottom) piece. */
  isEnd: boolean;
}

/**
 * Split an activity into per-column pieces in the display timezone, so an
 * activity that crosses midnight renders continuously across day columns.
 */
export function activityPieces(
  startAtISO: string,
  endAtISO: string,
  columnDates: string[],
  displayTz: string
): ActivityPiece[] {
  const s = zonedParts(new Date(startAtISO), displayTz);
  const e = zonedParts(new Date(endAtISO), displayTz);

  // An end at exactly 00:00 belongs to the end of the previous day.
  let eDate = e.date;
  let eMin = e.minutes;
  if (eMin === 0) {
    eDate = addDays(e.date, -1);
    eMin = 1440;
  }

  const pieces: ActivityPiece[] = [];
  columnDates.forEach((date, colIndex) => {
    if (date < s.date || date > eDate) return;
    const top = date === s.date ? s.minutes : 0;
    const bot = date === eDate ? eMin : 1440;
    if (bot > top) {
      pieces.push({
        colIndex,
        startMin: top,
        endMin: bot,
        isStart: date === s.date,
        isEnd: date === eDate,
      });
    }
  });
  return pieces;
}
