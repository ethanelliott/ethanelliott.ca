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

interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Build the day columns for a trip: a continuous run of calendar dates from the
 * earliest to the latest date across segments (and any extra ranges, e.g.
 * hotels), each resolved to the timezone/colour of the segment that contains it.
 */
export function resolveColumns(
  segments: Segment[],
  homeTz: string,
  extraRanges: DateRange[] = []
): ScheduleColumn[] {
  const ranges: DateRange[] = [...segments, ...extraRanges];
  if (ranges.length === 0) return [];

  const start = ranges.reduce(
    (min, s) => (s.startDate < min ? s.startDate : min),
    ranges[0].startDate
  );
  const end = ranges.reduce(
    (max, s) => (s.endDate > max ? s.endDate : max),
    ranges[0].endDate
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

export interface Span<T> {
  item: T;
  /** 0-based inclusive column index where the bar starts. */
  startCol: number;
  /** 0-based inclusive column index where the bar ends. */
  endCol: number;
  /** Stacking lane for overlapping bars. */
  lane: number;
}

export interface SpanLayout<T> {
  spans: Span<T>[];
  laneCount: number;
}

/**
 * Lay out date-ranged items (locations, hotels) as horizontal bars across the
 * day columns, stacking overlapping ones into separate lanes so travel-day
 * overlaps are visible.
 */
export function layoutSpans<T extends DateRange>(
  items: T[],
  columnDates: string[]
): SpanLayout<T> {
  if (columnDates.length === 0) return { spans: [], laneCount: 0 };
  const last = columnDates.length - 1;

  const placed = items
    .map((item) => {
      // First column on/after the start, last column on/before the end.
      let startCol = columnDates.findIndex((d) => d >= item.startDate);
      if (startCol === -1) return null; // starts after the visible range
      let endCol = -1;
      for (let i = last; i >= 0; i--) {
        if (columnDates[i] <= item.endDate) {
          endCol = i;
          break;
        }
      }
      if (endCol === -1) return null; // ends before the visible range
      startCol = Math.max(0, startCol);
      endCol = Math.min(last, endCol);
      if (endCol < startCol) return null;
      return { item, startCol, endCol, lane: 0 };
    })
    .filter((s): s is Span<T> => s !== null)
    .sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);

  const laneEnds: number[] = [];
  for (const span of placed) {
    let lane = laneEnds.findIndex((end) => end < span.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(span.endCol);
    } else {
      laneEnds[lane] = span.endCol;
    }
    span.lane = lane;
  }

  return { spans: placed, laneCount: laneEnds.length };
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
