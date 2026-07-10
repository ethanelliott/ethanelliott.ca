import { createTool, getToolRegistry } from '../tool-registry';

const NTFY_URL = process.env['NTFY_URL'];
const NTFY_TOPIC = process.env['NTFY_TOPIC'] || 'ai-gateway';

/** ─── in-memory notification history ──────────────────────────── */

interface NotificationRecord {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  topic: string;
  priority: string;
  tags?: string;
}

const notificationHistory: NotificationRecord[] = [];
let notifIdCounter = 1;

/** ─── send_notification ─────────────────────────────────────────── */

const sendNotification = createTool(
  {
    name: 'send_notification',
    description:
      'Send a push notification via ntfy. Requires NTFY_URL env var. Supports priority, title, emoji tags, and click URLs.',
    category: 'communication',
    tags: ['notification', 'ntfy', 'push'],
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Notification body text' },
        title: { type: 'string', description: 'Notification title (optional)' },
        topic: {
          type: 'string',
          description: `ntfy topic to publish to (default: ${NTFY_TOPIC})`,
        },
        priority: {
          type: 'string',
          enum: ['min', 'low', 'default', 'high', 'urgent'],
          description: 'Notification priority (default: default)',
        },
        tags: {
          type: 'string',
          description:
            'Comma-separated ntfy tags/emoji codes (e.g. "warning,rotating_light")',
        },
        click_url: {
          type: 'string',
          description: 'URL to open when notification is tapped',
        },
      },
      required: ['message'],
    },
  },
  async (params) => {
    if (!NTFY_URL) {
      return {
        success: false,
        error: 'NTFY_URL not configured. Set it to enable push notifications.',
      };
    }

    const message = params.message as string;
    const title = (params.title as string) || 'AI Gateway';
    const topic = (params.topic as string) || NTFY_TOPIC;
    const priority = (params.priority as string) || 'default';
    const tags = params.tags as string | undefined;
    const clickUrl = params.click_url as string | undefined;

    const headers: Record<string, string> = {
      Title: title,
      Priority: priority,
    };
    if (tags) headers['Tags'] = tags;
    if (clickUrl) headers['Click'] = clickUrl;

    try {
      const resp = await fetch(`${NTFY_URL}/${topic}`, {
        method: 'POST',
        headers,
        body: message,
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        return {
          success: false,
          error: `ntfy error: ${resp.status} ${resp.statusText}`,
        };
      }

      const record: NotificationRecord = {
        id: String(notifIdCounter++),
        timestamp: new Date().toISOString(),
        title,
        message,
        topic,
        priority,
        tags,
      };
      notificationHistory.unshift(record);

      return { success: true, data: { sent: record } };
    } catch (err) {
      return {
        success: false,
        error: `ntfy push failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── get_notifications_history ─────────────────────────────────── */

const getNotificationsHistory = createTool(
  {
    name: 'get_notifications_history',
    description:
      'Retrieve recent push notifications sent by the AI gateway in this session.',
    category: 'communication',
    tags: ['notification', 'history'],
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max entries to return (default: 10)',
        },
      },
    },
  },
  async (params) => {
    const limit = (params.limit as number) || 10;
    return {
      success: true,
      data: {
        count: notificationHistory.length,
        notifications: notificationHistory.slice(0, limit),
      },
    };
  }
);

/** ─── create_meeting_invite_text ──────────────────────────────────── */

const createMeetingInviteText = createTool(
  {
    name: 'create_meeting_invite_text',
    description:
      'Generate a plain-text meeting invite block (compatible with iCal/calendar paste).',
    category: 'communication',
    tags: ['meeting', 'invite', 'calendar'],
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Meeting title' },
        start: { type: 'string', description: 'Start datetime (ISO 8601)' },
        end: { type: 'string', description: 'End datetime (ISO 8601)' },
        location: { type: 'string', description: 'Location or video link' },
        description: {
          type: 'string',
          description: 'Meeting agenda or description',
        },
        organizer_name: { type: 'string', description: 'Organizer name' },
        organizer_email: { type: 'string', description: 'Organizer email' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  async (params) => {
    const { randomUUID } = await import('crypto');
    const uid = randomUUID();

    const startDate = new Date(params.start as string);
    const endDate = new Date(params.end as string);
    const toIcal = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AI Gateway//Meeting Invite//EN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toIcal(new Date())}`,
      `DTSTART:${toIcal(startDate)}`,
      `DTEND:${toIcal(endDate)}`,
      `SUMMARY:${(params.title as string).replace(/,/g, '\\,')}`,
      params.location
        ? `LOCATION:${(params.location as string).replace(/,/g, '\\,')}`
        : '',
      params.description
        ? `DESCRIPTION:${(params.description as string)
            .replace(/\n/g, '\\n')
            .replace(/,/g, '\\,')}`
        : '',
      params.organizer_email
        ? `ORGANIZER;CN=${
            params.organizer_name || 'Meeting Organizer'
          }:mailto:${params.organizer_email}`
        : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');

    const humanReadable = [
      `📅 ${params.title}`,
      `🕐 ${startDate.toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
      })} – ${endDate.toLocaleTimeString('en-US', { timeStyle: 'short' })}`,
      params.location ? `📍 ${params.location}` : '',
      params.description ? `📝 ${params.description}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      success: true,
      data: {
        humanReadable,
        icalBlock: lines,
        uid,
      },
    };
  }
);

// Register all communication tools
const registry = getToolRegistry();
registry.register(sendNotification);
registry.register(getNotificationsHistory);
registry.register(createMeetingInviteText);

export {
  sendNotification,
  getNotificationsHistory,
  createMeetingInviteText,
};
