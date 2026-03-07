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

/** ─── draft_email ───────────────────────────────────────────────── */

const draftEmail = createTool(
  {
    name: 'draft_email',
    description:
      'Compose a professional or casual email from bullet-point intent. Returns both a formal and casual draft.',
    category: 'communication',
    tags: ['email', 'draft', 'writing'],
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description:
            'What the email is about (bullet points or prose). E.g. "Decline meeting on Friday; suggest Tuesday instead; keep it friendly"',
        },
        recipient_name: {
          type: 'string',
          description: 'Recipient first name (optional)',
        },
        sender_name: { type: 'string', description: 'Your name (optional)' },
        subject_hint: {
          type: 'string',
          description: 'Optional subject line hint',
        },
        tone: {
          type: 'string',
          enum: ['formal', 'casual', 'both'],
          description: 'Desired tone (default: both)',
        },
      },
      required: ['intent'],
    },
  },
  async (params) => {
    // This tool returns a structured template. The LLM calling this tool composes the actual text.
    const intent = params.intent as string;
    const recipient = (params.recipient_name as string) || 'there';
    const sender = (params.sender_name as string) || '';
    const subject =
      (params.subject_hint as string) || '[Subject based on intent]';
    const tone = (params.tone as string) || 'both';

    const formal = [
      `Subject: ${subject}`,
      '',
      `Dear ${recipient},`,
      '',
      `[Formal draft based on intent: "${intent}"]`,
      '',
      'I hope this message finds you well.',
      '',
      `[Main body covering: ${intent}]`,
      '',
      `Best regards,`,
      sender || '[Your Name]',
    ].join('\n');

    const casual = [
      `Subject: ${subject}`,
      '',
      `Hey ${recipient},`,
      '',
      `[Casual draft based on intent: "${intent}"]`,
      '',
      `[Main body covering: ${intent}]`,
      '',
      `Cheers,`,
      sender || '[Your Name]',
    ].join('\n');

    return {
      success: true,
      data: {
        note: 'Use these templates as a starting point. The AI will fill in the body based on your intent.',
        intent,
        suggestions: {
          subjectLine: subject,
          formal: tone !== 'casual' ? formal : undefined,
          casual: tone !== 'formal' ? casual : undefined,
        },
      },
    };
  }
);

/** ─── draft_message ──────────────────────────────────────────────── */

const draftMessage = createTool(
  {
    name: 'draft_message',
    description:
      'Compose a short text or chat message from intent bullet points. Returns formal and casual variants.',
    category: 'communication',
    tags: ['message', 'sms', 'chat', 'draft'],
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description:
            'What the message needs to say (brief description or bullets)',
        },
        tone: {
          type: 'string',
          enum: ['formal', 'casual', 'both'],
          description: 'Desired tone (default: both)',
        },
        max_chars: {
          type: 'number',
          description: 'Target character limit (e.g. 160 for SMS)',
        },
      },
      required: ['intent'],
    },
  },
  async (params) => {
    const intent = params.intent as string;
    const tone = (params.tone as string) || 'both';
    const maxChars = params.max_chars as number | undefined;

    return {
      success: true,
      data: {
        intent,
        maxChars,
        templateDrafts: {
          formal:
            tone !== 'casual'
              ? `[Formal message draft (max ${
                  maxChars ?? 'unlimited'
                } chars): "${intent}"]`
              : undefined,
          casual:
            tone !== 'formal'
              ? `[Casual message draft (max ${
                  maxChars ?? 'unlimited'
                } chars): "${intent}"]`
              : undefined,
        },
        note: 'Use these as direction for composing the final message content.',
      },
    };
  }
);

/** ─── summarize_email_thread ──────────────────────────────────────── */

const summarizeEmailThread = createTool(
  {
    name: 'summarize_email_thread',
    description:
      'Summarize a pasted email thread, extract key decisions and action items.',
    category: 'communication',
    tags: ['email', 'summary', 'thread'],
    parameters: {
      type: 'object',
      properties: {
        thread_text: {
          type: 'string',
          description: 'The full email thread (paste raw text)',
        },
      },
      required: ['thread_text'],
    },
  },
  async (params) => {
    const text = params.thread_text as string;
    const wordCount = text.split(/\s+/).length;

    // Return the text structured for the LLM to summarize in its reply
    return {
      success: true,
      data: {
        wordCount,
        threadPreview:
          text.substring(0, 500) + (text.length > 500 ? '...' : ''),
        instruction:
          'Thread text captured. Please summarize: (1) key topic, (2) decisions made, (3) open action items, (4) suggested next action.',
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
        .replace(/\.\d{3}/, '') + 'Z';

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
registry.register(draftEmail);
registry.register(draftMessage);
registry.register(summarizeEmailThread);
registry.register(createMeetingInviteText);

export {
  sendNotification,
  getNotificationsHistory,
  draftEmail,
  draftMessage,
  summarizeEmailThread,
  createMeetingInviteText,
};
