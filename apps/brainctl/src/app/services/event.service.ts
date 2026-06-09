import { getDb, isVecLoaded } from '../db/database.js';
import { embed, serializeVec } from './embeddings.service.js';

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

export async function logEvent(input: LogEventInput): Promise<number> {
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

  const id = result.lastInsertRowid as number;

  if (isVecLoaded()) {
    const vec = await embed(input.summary);
    if (vec) {
      db.prepare('INSERT OR REPLACE INTO vec_events(rowid, embedding) VALUES (?, ?)')
        .run(id, serializeVec(vec));
    }
  }

  return id;
}

export function searchEventsFts(input: SearchEventsInput): BrainEvent[] {
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

export async function searchEventsVec(input: SearchEventsInput): Promise<BrainEvent[]> {
  if (!isVecLoaded()) return [];
  const db = getDb();
  const vec = await embed(input.query);
  if (!vec) return [];
  const agentId = input.agent_id ?? 'default';
  const limit = input.limit ?? 10;
  try {
    return db.prepare(`
      SELECT e.* FROM vec_events v
      JOIN events e ON e.id = v.rowid
      WHERE v.embedding MATCH ? AND k = ? AND e.agent_id = ?
      ORDER BY v.distance
    `).all(serializeVec(vec), limit, agentId) as BrainEvent[];
  } catch {
    return [];
  }
}

export async function searchEvents(input: SearchEventsInput): Promise<BrainEvent[]> {
  const [fts, vec] = await Promise.all([searchEventsFts(input), searchEventsVec(input)]);
  return rrfMergeEvents(fts, vec, input.limit ?? 10);
}

function rrfMergeEvents(fts: BrainEvent[], vec: BrainEvent[], limit: number): BrainEvent[] {
  const K = 60;
  const scores = new Map<number, number>();
  const byId = new Map<number, BrainEvent>();
  for (let i = 0; i < fts.length; i++) {
    scores.set(fts[i].id, (scores.get(fts[i].id) ?? 0) + 1 / (K + i + 1));
    byId.set(fts[i].id, fts[i]);
  }
  for (let i = 0; i < vec.length; i++) {
    scores.set(vec[i].id, (scores.get(vec[i].id) ?? 0) + 1 / (K + i + 1));
    byId.set(vec[i].id, vec[i]);
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => byId.get(id)!);
}

export function getEvent(id: number, agentId = 'default'): BrainEvent | undefined {
  return getDb().prepare('SELECT * FROM events WHERE id = ? AND agent_id = ?')
    .get(id, agentId) as BrainEvent | undefined;
}

export function deleteEvent(id: number, agentId = 'default'): boolean {
  const db = getDb();
  if (isVecLoaded()) db.prepare('DELETE FROM vec_events WHERE rowid = ?').run(id);
  return db.prepare('DELETE FROM events WHERE id = ? AND agent_id = ?').run(id, agentId).changes > 0;
}

export function listEvents(input: {
  agent_id?: string; event_type?: string; project?: string;
  limit?: number; offset?: number;
}): BrainEvent[] {
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  let sql = 'SELECT * FROM events WHERE agent_id = @agent_id';
  const params: Record<string, unknown> = { agent_id: agentId, limit: input.limit ?? 50, offset: input.offset ?? 0 };
  if (input.event_type) { sql += ' AND event_type = @event_type'; params['event_type'] = input.event_type; }
  if (input.project) { sql += ' AND project = @project'; params['project'] = input.project; }
  sql += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';
  return db.prepare(sql).all(params) as BrainEvent[];
}

export function getRecentEvents(agentId = 'default', limit = 10): BrainEvent[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM events WHERE agent_id = @agent_id
    ORDER BY created_at DESC LIMIT @limit
  `).all({ agent_id: agentId, limit }) as BrainEvent[];
}

export function getEventsWithoutEmbeddings(agentId: string, limit: number): BrainEvent[] {
  const db = getDb();
  return db.prepare(`
    SELECT e.* FROM events e
    LEFT JOIN vec_events v ON v.rowid = e.id
    WHERE e.agent_id = @agent_id AND v.rowid IS NULL
    LIMIT @limit
  `).all({ agent_id: agentId, limit }) as BrainEvent[];
}
