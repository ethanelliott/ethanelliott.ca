import { getDb } from '../db/database.js';
import { searchMemories } from './memory.service.js';

export interface Webhook {
  id: number;
  name: string;
  url: string;
  secret: string | null;
  events: string;
  active: number;
  created_at: string;
}

function ensureWebhookTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      secret TEXT,
      events TEXT NOT NULL DEFAULT '*',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function upsertWebhook(input: {
  name: string; url: string; secret?: string; events?: string;
}): number {
  ensureWebhookTable();
  const result = getDb().prepare(`
    INSERT INTO webhooks (name, url, secret, events)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET url = excluded.url, secret = excluded.secret, events = excluded.events
  `).run(input.name, input.url, input.secret ?? null, input.events ?? '*');
  return result.lastInsertRowid as number;
}

export function listWebhooks(): Webhook[] {
  ensureWebhookTable();
  return getDb().prepare('SELECT * FROM webhooks WHERE active = 1 ORDER BY name').all() as Webhook[];
}

export function deleteWebhook(name: string): boolean {
  ensureWebhookTable();
  return getDb().prepare('DELETE FROM webhooks WHERE name = ?').run(name).changes > 0;
}

async function deliverPayload(url: string, payload: unknown, secret?: string | null): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) headers['X-Brainctl-Secret'] = secret;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function pushMemories(input: {
  agent_id?: string;
  query?: string;
  memory_ids?: number[];
  webhook: string;
  event_type?: string;
}): Promise<{ delivered: boolean; count: number; webhook: string; result: object }> {
  ensureWebhookTable();
  const db = getDb();
  const agentId = input.agent_id ?? 'default';

  const hook = db.prepare('SELECT * FROM webhooks WHERE name = ? AND active = 1')
    .get(input.webhook) as Webhook | undefined;
  if (!hook) throw new Error(`Webhook not found: ${input.webhook}`);

  let memories: object[] = [];

  if (input.memory_ids?.length) {
    memories = db.prepare(
      `SELECT * FROM memories WHERE id IN (${input.memory_ids.map(() => '?').join(',')}) AND agent_id = ?`,
    ).all(...input.memory_ids, agentId) as object[];
  } else if (input.query) {
    memories = await searchMemories({ query: input.query, limit: 20, agent_id: agentId });
  }

  const payload = {
    event_type: input.event_type ?? 'memory.push',
    agent_id: agentId,
    sent_at: new Date().toISOString(),
    memories,
  };

  const result = await deliverPayload(hook.url, payload, hook.secret);
  return { delivered: result.ok, count: memories.length, webhook: hook.name, result };
}

export async function pushReport(input: {
  agent_id?: string;
  title: string;
  body: object;
  webhook: string;
}): Promise<{ delivered: boolean; webhook: string; result: object }> {
  ensureWebhookTable();
  const db = getDb();

  const hook = db.prepare('SELECT * FROM webhooks WHERE name = ? AND active = 1')
    .get(input.webhook) as Webhook | undefined;
  if (!hook) throw new Error(`Webhook not found: ${input.webhook}`);

  const payload = {
    event_type: 'report',
    agent_id: input.agent_id ?? 'default',
    title: input.title,
    sent_at: new Date().toISOString(),
    body: input.body,
  };

  const result = await deliverPayload(hook.url, payload, hook.secret);
  return { delivered: result.ok, webhook: hook.name, result };
}
