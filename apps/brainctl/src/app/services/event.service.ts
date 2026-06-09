import { getDb } from '../db/database.js';

export interface BrainEvent {
  id: number;
  agent_id: string;
  summary: string;
  event_type: string;
  project: string | null;
  importance: number;
  created_at: string;
}

export interface LogEventInput {
  summary: string;
  event_type?: string;
  project?: string;
  importance?: number;
  agent_id?: string;
}

export interface SearchEventsInput {
  query: string;
  limit?: number;
  event_type?: string;
  project?: string;
  agent_id?: string;
}

export function logEvent(input: LogEventInput): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO events (agent_id, summary, event_type, project, importance)
    VALUES (@agent_id, @summary, @event_type, @project, @importance)
  `).run({
    agent_id: input.agent_id ?? 'default',
    summary: input.summary,
    event_type: input.event_type ?? 'observation',
    project: input.project ?? null,
    importance: input.importance ?? 0.5,
  });
  return result.lastInsertRowid as number;
}

export function searchEvents(input: SearchEventsInput): BrainEvent[] {
  const db = getDb();
  const limit = input.limit ?? 10;
  const agentId = input.agent_id ?? 'default';

  const sanitized = input.query
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .join(' OR ');

  if (!sanitized) return [];

  let sql = `
    SELECT e.* FROM events e
    JOIN events_fts fts ON fts.rowid = e.id
    WHERE events_fts MATCH @query AND e.agent_id = @agent_id
  `;
  const params: Record<string, unknown> = { query: sanitized, agent_id: agentId, limit };

  if (input.event_type) {
    sql += ' AND e.event_type = @event_type';
    params['event_type'] = input.event_type;
  }
  if (input.project) {
    sql += ' AND e.project = @project';
    params['project'] = input.project;
  }

  sql += ' ORDER BY rank LIMIT @limit';

  try {
    return db.prepare(sql).all(params) as BrainEvent[];
  } catch {
    const fallback = `
      SELECT * FROM events
      WHERE agent_id = @agent_id AND summary LIKE @like
      ORDER BY created_at DESC LIMIT @limit
    `;
    return db.prepare(fallback).all({ agent_id: agentId, like: `%${input.query}%`, limit }) as BrainEvent[];
  }
}

export function getRecentEvents(agentId = 'default', limit = 10): BrainEvent[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM events WHERE agent_id = @agent_id
    ORDER BY created_at DESC LIMIT @limit
  `).all({ agent_id: agentId, limit }) as BrainEvent[];
}
