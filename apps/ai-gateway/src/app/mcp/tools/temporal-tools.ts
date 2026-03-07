import { createTool, getToolRegistry } from '../tool-registry';
import {
  format,
  differenceInDays,
  differenceInSeconds,
  differenceInBusinessDays,
  parseISO,
  addDays,
  startOfWeek,
  endOfWeek,
  getWeek,
  getQuarter,
  getDayOfYear,
  isValid,
} from 'date-fns';

/** ─── helpers ─────────────────────────────────────────────── */

function parseFlexDate(input: string): Date | null {
  // ISO or natural shorthand
  try {
    const d = new Date(input);
    if (isValid(d)) return d;
  } catch {}
  try {
    const d = parseISO(input);
    if (isValid(d)) return d;
  } catch {}
  return null;
}

function localeDate(date: Date, tz: string): string {
  try {
    return date.toLocaleString('en-US', {
      timeZone: tz,
      dateStyle: 'full',
      timeStyle: 'long',
    });
  } catch {
    return date.toUTCString();
  }
}

const CALDAV_URL = process.env['CALDAV_URL'];
const CALDAV_USERNAME = process.env['CALDAV_USERNAME'];
const CALDAV_PASSWORD = process.env['CALDAV_PASSWORD'];

function caldavAuthorization(): string | null {
  if (!CALDAV_URL || !CALDAV_USERNAME || !CALDAV_PASSWORD) return null;
  return (
    'Basic ' +
    Buffer.from(`${CALDAV_USERNAME}:${CALDAV_PASSWORD}`).toString('base64')
  );
}

/** ─── get_date_info ────────────────────────────────────────── */

const getDateInfo = createTool(
  {
    name: 'get_date_info',
    description:
      'Get detailed information about a specific date — day of week, week number, quarter, days until end of year, etc.',
    category: 'temporal',
    tags: ['date', 'calendar'],
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description:
            'Date string (ISO 8601 or natural language like "2025-03-07"). Defaults to today.',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (default: UTC)',
        },
      },
    },
  },
  async (params) => {
    const tz = (params.timezone as string) || 'UTC';
    const input = (params.date as string) || new Date().toISOString();
    const date = parseFlexDate(input);
    if (!date) {
      return { success: false, error: `Cannot parse date: "${input}"` };
    }

    const year = date.getFullYear();
    const dayOfYear = getDayOfYear(date);
    const endOfYear = new Date(year, 11, 31);
    const daysLeftInYear = differenceInDays(endOfYear, date);

    const quarterEnd = [
      new Date(year, 2, 31),
      new Date(year, 5, 30),
      new Date(year, 8, 30),
      new Date(year, 11, 31),
    ];
    const q = getQuarter(date);
    const daysLeftInQuarter = differenceInDays(quarterEnd[q - 1], date);

    return {
      success: true,
      data: {
        iso: date.toISOString(),
        formatted: localeDate(date, tz),
        dayOfWeek: format(date, 'EEEE'),
        weekNumber: getWeek(date),
        quarter: `Q${q}`,
        dayOfYear,
        daysLeftInYear,
        daysLeftInQuarter,
        weekStart: format(startOfWeek(date), 'yyyy-MM-dd'),
        weekEnd: format(endOfWeek(date), 'yyyy-MM-dd'),
      },
    };
  }
);

/** ─── convert_timezone ─────────────────────────────────────── */

const convertTimezone = createTool(
  {
    name: 'convert_timezone',
    description: 'Convert a timestamp between any two IANA timezones.',
    category: 'temporal',
    tags: ['timezone', 'time'],
    parameters: {
      type: 'object',
      properties: {
        datetime: {
          type: 'string',
          description: 'ISO 8601 datetime string or descriptive date/time',
        },
        from_timezone: {
          type: 'string',
          description: 'Source IANA timezone (e.g. "America/New_York")',
        },
        to_timezone: {
          type: 'string',
          description:
            'Target IANA timezone (e.g. "Asia/Tokyo"). Defaults to UTC.',
        },
      },
      required: ['datetime', 'from_timezone'],
    },
  },
  async (params) => {
    const dt = params.datetime as string;
    const fromTz = params.from_timezone as string;
    const toTz = (params.to_timezone as string) || 'UTC';

    const date = parseFlexDate(dt);
    if (!date) {
      return { success: false, error: `Cannot parse datetime: "${dt}"` };
    }

    try {
      return {
        success: true,
        data: {
          original: { datetime: dt, timezone: fromTz },
          converted: {
            datetime: date.toLocaleString('en-CA', {
              timeZone: toTz,
              hour12: false,
            }),
            formatted: localeDate(date, toTz),
            timezone: toTz,
          },
          iso: date.toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Invalid timezone: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── time_until ───────────────────────────────────────────── */

const timeUntil = createTool(
  {
    name: 'time_until',
    description:
      'Count down to a future date/event (e.g. "days until Christmas").',
    category: 'temporal',
    tags: ['countdown', 'date'],
    parameters: {
      type: 'object',
      properties: {
        target_date: {
          type: 'string',
          description: 'Target date as ISO string or descriptive string',
        },
        event_name: {
          type: 'string',
          description: 'Optional event label (e.g. "Christmas")',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone for the calculation (default: UTC)',
        },
      },
      required: ['target_date'],
    },
  },
  async (params) => {
    const target = parseFlexDate(params.target_date as string);
    if (!target) {
      return {
        success: false,
        error: `Cannot parse date: "${params.target_date}"`,
      };
    }

    const now = new Date();
    const totalSeconds = differenceInSeconds(target, now);

    if (totalSeconds < 0) {
      return {
        success: false,
        error: 'The target date is in the past. Use time_since instead.',
      };
    }

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return {
      success: true,
      data: {
        event: (params.event_name as string) || target.toISOString(),
        targetDate: target.toISOString(),
        totalDays: differenceInDays(target, now),
        breakdown: { days, hours, minutes },
        human: `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${
          hours !== 1 ? 's' : ''
        }, ${minutes} minute${minutes !== 1 ? 's' : ''}`,
      },
    };
  }
);

/** ─── time_since ───────────────────────────────────────────── */

const timeSince = createTool(
  {
    name: 'time_since',
    description: 'Calculate elapsed time since a past date.',
    category: 'temporal',
    tags: ['elapsed', 'date'],
    parameters: {
      type: 'object',
      properties: {
        past_date: {
          type: 'string',
          description: 'Past date as ISO string',
        },
        event_name: {
          type: 'string',
          description: 'Optional event label',
        },
      },
      required: ['past_date'],
    },
  },
  async (params) => {
    const past = parseFlexDate(params.past_date as string);
    if (!past) {
      return {
        success: false,
        error: `Cannot parse date: "${params.past_date}"`,
      };
    }

    const now = new Date();
    const totalSeconds = differenceInSeconds(now, past);

    if (totalSeconds < 0) {
      return {
        success: false,
        error: 'The date is in the future. Use time_until instead.',
      };
    }

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);

    return {
      success: true,
      data: {
        event: (params.event_name as string) || past.toISOString(),
        pastDate: past.toISOString(),
        totalDays: differenceInDays(now, past),
        breakdown: { years, months, days: days % 30, hours, minutes },
        human:
          years > 0
            ? `${years} year${years !== 1 ? 's' : ''} and ${months} month${
                months !== 1 ? 's' : ''
              }`
            : `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${
                hours !== 1 ? 's' : ''
              }`,
      },
    };
  }
);

/** ─── format_duration ──────────────────────────────────────── */

const formatDuration = createTool(
  {
    name: 'format_duration',
    description:
      'Convert a duration in seconds to a human-readable string (e.g. "2 hours 34 minutes").',
    category: 'temporal',
    tags: ['duration', 'time'],
    parameters: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'Duration in seconds',
        },
      },
      required: ['seconds'],
    },
  },
  async (params) => {
    const total = Math.abs(params.seconds as number);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);

    const parts: string[] = [];
    if (days) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (secs && days === 0)
      parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);

    return {
      success: true,
      data: {
        totalSeconds: total,
        human: parts.join(', ') || '0 seconds',
        breakdown: { days, hours, minutes, seconds: secs },
      },
    };
  }
);

/** ─── business_days ────────────────────────────────────────── */

const businessDays = createTool(
  {
    name: 'business_days',
    description:
      'Count working (business) days between two dates, excluding weekends.',
    category: 'temporal',
    tags: ['business', 'date'],
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date (ISO 8601)' },
        end_date: { type: 'string', description: 'End date (ISO 8601)' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  async (params) => {
    const start = parseFlexDate(params.start_date as string);
    const end = parseFlexDate(params.end_date as string);
    if (!start || !end) {
      return { success: false, error: 'Invalid date input' };
    }

    const bdays = differenceInBusinessDays(end, start);

    return {
      success: true,
      data: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        businessDays: bdays,
        calendarDays: differenceInDays(end, start),
      },
    };
  }
);

/** ─── list_calendar_events ─────────────────────────────────── */

const listCalendarEvents = createTool(
  {
    name: 'list_calendar_events',
    description:
      'List calendar events for a time window via CalDAV (requires CALDAV_URL, CALDAV_USERNAME, CALDAV_PASSWORD env vars).',
    category: 'temporal',
    tags: ['calendar', 'events'],
    parameters: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start of window (ISO 8601). Defaults to today.',
        },
        end_date: {
          type: 'string',
          description: 'End of window (ISO 8601). Defaults to 7 days from now.',
        },
      },
    },
  },
  async (params) => {
    const auth = caldavAuthorization();
    if (!auth) {
      return {
        success: false,
        error:
          'CalDAV not configured. Set CALDAV_URL, CALDAV_USERNAME, and CALDAV_PASSWORD.',
      };
    }

    const start =
      parseFlexDate(
        (params.start_date as string) || new Date().toISOString()
      ) || new Date();
    const end =
      parseFlexDate(
        (params.end_date as string) || addDays(new Date(), 7).toISOString()
      ) || addDays(new Date(), 7);

    const startStr = start
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    const endStr = end
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

    const report = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startStr}Z" end="${endStr}Z"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

    try {
      const resp = await fetch(`${CALDAV_URL}`, {
        method: 'REPORT',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/xml; charset=utf-8',
          Depth: '1',
        },
        body: report,
        signal: AbortSignal.timeout(10000),
      });

      const xml = await resp.text();

      // Parse SUMMARY, DTSTART, DTEND from raw iCal data
      const events: { summary: string; start: string; end: string }[] = [];
      const eventBlocks = xml.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
      for (const block of eventBlocks) {
        const summary =
          (block.match(/SUMMARY[^:]*:(.+)/) || [])[1]?.trim() || '(no title)';
        const dtstart =
          (block.match(/DTSTART[^:]*:(.+)/) || [])[1]?.trim() || '';
        const dtend = (block.match(/DTEND[^:]*:(.+)/) || [])[1]?.trim() || '';
        events.push({ summary, start: dtstart, end: dtend });
      }
      events.sort((a, b) => a.start.localeCompare(b.start));

      return {
        success: true,
        data: {
          window: { start: start.toISOString(), end: end.toISOString() },
          count: events.length,
          events,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `CalDAV request failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── get_daily_agenda ──────────────────────────────────────── */

const getDailyAgenda = createTool(
  {
    name: 'get_daily_agenda',
    description:
      "Get today's agenda as a narrative: events, plus any additional context.",
    category: 'temporal',
    tags: ['agenda', 'calendar'],
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date to look up (default: today)',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (default: UTC)',
        },
      },
    },
  },
  async (params) => {
    const tz = (params.timezone as string) || 'UTC';
    const date =
      parseFlexDate((params.date as string) || new Date().toISOString()) ||
      new Date();
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const auth = caldavAuthorization();
    let events: { summary: string; start: string; end: string }[] = [];

    if (auth) {
      const startStr = dayStart
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
      const endStr = dayEnd
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
      const report = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startStr}Z" end="${endStr}Z"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
      try {
        const resp = await fetch(`${CALDAV_URL}`, {
          method: 'REPORT',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/xml; charset=utf-8',
            Depth: '1',
          },
          body: report,
          signal: AbortSignal.timeout(10000),
        });
        const xml = await resp.text();
        const blocks = xml.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
        for (const block of blocks) {
          const summary =
            (block.match(/SUMMARY[^:]*:(.+)/) || [])[1]?.trim() || '(no title)';
          const dtstart =
            (block.match(/DTSTART[^:]*:(.+)/) || [])[1]?.trim() || '';
          const dtend = (block.match(/DTEND[^:]*:(.+)/) || [])[1]?.trim() || '';
          events.push({ summary, start: dtstart, end: dtend });
        }
        events.sort((a, b) => a.start.localeCompare(b.start));
      } catch {
        // ignore calendar errors
      }
    }

    const dateStr = date.toLocaleDateString('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let narrative = `Today is ${dateStr}.\n`;
    if (events.length === 0) {
      narrative += auth
        ? 'No events found on your calendar today.'
        : 'Calendar not configured (set CALDAV_* env vars to load events).';
    } else {
      narrative += `You have ${events.length} event${
        events.length !== 1 ? 's' : ''
      } today:\n`;
      for (const ev of events) {
        narrative += `- ${ev.summary} (${ev.start} → ${ev.end})\n`;
      }
    }

    return {
      success: true,
      data: {
        date: date.toISOString(),
        timezone: tz,
        events,
        narrative,
      },
    };
  }
);

/** ─── create_calendar_event ────────────────────────────────── */

const createCalendarEvent = createTool(
  {
    name: 'create_calendar_event',
    description:
      'Create a new calendar event via CalDAV. Requires approval. Needs CALDAV_* env vars.',
    category: 'temporal',
    tags: ['calendar', 'create'],
    approval: {
      required: true,
      message: 'This will create a new calendar event. Please confirm.',
    },
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start datetime (ISO 8601)' },
        end: { type: 'string', description: 'End datetime (ISO 8601)' },
        description: {
          type: 'string',
          description: 'Optional event description',
        },
        location: { type: 'string', description: 'Optional location' },
      },
      required: ['summary', 'start', 'end'],
    },
  },
  async (params) => {
    const auth = caldavAuthorization();
    if (!auth) {
      return {
        success: false,
        error:
          'CalDAV not configured. Set CALDAV_URL, CALDAV_USERNAME, CALDAV_PASSWORD.',
      };
    }

    const { randomUUID } = await import('crypto');
    const uid = randomUUID();
    const start = parseFlexDate(params.start as string);
    const end = parseFlexDate(params.end as string);
    if (!start || !end) {
      return { success: false, error: 'Invalid start or end date' };
    }

    const toIcal = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AI Gateway//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toIcal(new Date())}Z`,
      `DTSTART:${toIcal(start)}Z`,
      `DTEND:${toIcal(end)}Z`,
      `SUMMARY:${(params.summary as string).replace(/\n/g, '\\n')}`,
      params.description
        ? `DESCRIPTION:${(params.description as string).replace(/\n/g, '\\n')}`
        : '',
      params.location ? `LOCATION:${params.location}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');

    try {
      const putUrl = `${CALDAV_URL}/${uid}.ics`;
      const resp = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          Authorization: auth,
          'Content-Type': 'text/calendar; charset=utf-8',
        },
        body: ical,
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok && resp.status !== 201 && resp.status !== 204) {
        return {
          success: false,
          error: `CalDAV PUT failed: ${resp.status} ${resp.statusText}`,
        };
      }

      return {
        success: true,
        data: {
          uid,
          summary: params.summary,
          start: start.toISOString(),
          end: end.toISOString(),
          message: 'Event created successfully.',
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `CalDAV request failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── find_free_time ────────────────────────────────────────── */

const findFreeTime = createTool(
  {
    name: 'find_free_time',
    description:
      'Suggest available time slots on a given day, given existing calendar events.',
    category: 'temporal',
    tags: ['calendar', 'scheduling'],
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Target date (ISO 8601, default: today)',
        },
        duration_minutes: {
          type: 'number',
          description: 'Desired meeting duration in minutes (default: 60)',
        },
        work_start_hour: {
          type: 'number',
          description: 'Start of workday hour (0–23, default: 9)',
        },
        work_end_hour: {
          type: 'number',
          description: 'End of workday hour (0–23, default: 17)',
        },
      },
    },
  },
  async (params) => {
    const date =
      parseFlexDate((params.date as string) || new Date().toISOString()) ||
      new Date();
    const duration = ((params.duration_minutes as number) || 60) * 60 * 1000;
    const startHour = (params.work_start_hour as number) ?? 9;
    const endHour = (params.work_end_hour as number) ?? 17;

    const dayStart = new Date(date);
    dayStart.setHours(startHour, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(endHour, 0, 0, 0);

    // Try to pull events from CalDAV
    const auth = caldavAuthorization();
    const busySlots: { start: Date; end: Date }[] = [];

    if (auth) {
      const toStr = (d: Date) =>
        d
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}/, '');
      const report = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toStr(dayStart)}Z" end="${toStr(dayEnd)}Z"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
      try {
        const resp = await fetch(`${CALDAV_URL}`, {
          method: 'REPORT',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/xml; charset=utf-8',
            Depth: '1',
          },
          body: report,
          signal: AbortSignal.timeout(10000),
        });
        const xml = await resp.text();
        for (const block of xml.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ||
          []) {
          const s = (block.match(/DTSTART[^:]*:(.+)/) || [])[1]?.trim();
          const e = (block.match(/DTEND[^:]*:(.+)/) || [])[1]?.trim();
          if (s && e) {
            const sd = new Date(
              s.replace(
                /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
                '$1-$2-$3T$4:$5:$6'
              )
            );
            const ed = new Date(
              e.replace(
                /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
                '$1-$2-$3T$4:$5:$6'
              )
            );
            if (isValid(sd) && isValid(ed))
              busySlots.push({ start: sd, end: ed });
          }
        }
        busySlots.sort((a, b) => a.start.getTime() - b.start.getTime());
      } catch {
        // ignore
      }
    }

    // Find free windows
    const freeSlots: { start: string; end: string; durationMinutes: number }[] =
      [];
    let cursor = dayStart.getTime();
    for (const busy of busySlots) {
      if (busy.start.getTime() - cursor >= duration) {
        const slotEnd = new Date(cursor + duration);
        freeSlots.push({
          start: new Date(cursor).toISOString(),
          end: slotEnd.toISOString(),
          durationMinutes: duration / 60000,
        });
      }
      cursor = Math.max(cursor, busy.end.getTime());
    }
    if (dayEnd.getTime() - cursor >= duration) {
      freeSlots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(cursor + duration).toISOString(),
        durationMinutes: duration / 60000,
      });
    }

    return {
      success: true,
      data: {
        date: date.toISOString().split('T')[0],
        requestedDurationMinutes: duration / 60000,
        busyCount: busySlots.length,
        freeSlots: freeSlots.slice(0, 8),
        calendarConnected: !!auth,
      },
    };
  }
);

// Register all temporal tools
const registry = getToolRegistry();
registry.register(getDateInfo);
registry.register(convertTimezone);
registry.register(timeUntil);
registry.register(timeSince);
registry.register(formatDuration);
registry.register(businessDays);
registry.register(listCalendarEvents);
registry.register(getDailyAgenda);
registry.register(createCalendarEvent);
registry.register(findFreeTime);

export {
  getDateInfo,
  convertTimezone,
  timeUntil,
  timeSince,
  formatDuration,
  businessDays,
  listCalendarEvents,
  getDailyAgenda,
  createCalendarEvent,
  findFreeTime,
};
