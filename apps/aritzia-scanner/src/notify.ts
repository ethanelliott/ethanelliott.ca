// ntfy push notifications. Mirrors the pattern used by the other apps in this
// repo (ip-monitor, camera): POST to `${NTFY_URL}/${NTFY_TOPIC}` with
// Title/Priority/Tags/Click headers, gated on NTFY_URL so it's a silent no-op
// when notifications aren't configured (e.g. local dev).

const NTFY_URL = process.env.NTFY_URL;
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'aritzia-scanner';

export type NtfyOptions = {
  title?: string;
  // ntfy priority: 1 (min) … 5 (max). Defaults to 'min' so scan summaries stay
  // quiet — they're informational, not urgent.
  priority?: 'min' | 'low' | 'default' | 'high' | 'max';
  tags?: string[];
  click?: string;
};

export async function sendNtfy(
  message: string,
  options: NtfyOptions = {}
): Promise<void> {
  if (!NTFY_URL) return;

  const headers: Record<string, string> = {
    Priority: options.priority || 'min',
  };
  if (options.title) headers.Title = options.title;
  if (options.tags && options.tags.length) headers.Tags = options.tags.join(',');
  if (options.click) headers.Click = options.click;

  try {
    const res = await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
      method: 'POST',
      headers,
      body: message,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`ntfy notification failed: ${res.status} ${res.statusText}`);
    } else {
      console.log(`Notification sent via ntfy (${NTFY_TOPIC}).`);
    }
  } catch (err) {
    console.error('Failed to send ntfy notification:', err);
  }
}
