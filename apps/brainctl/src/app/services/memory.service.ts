import { getDb } from '../db/database.js';

export interface Memory {
  id: number;
  agent_id: string;
  content: string;
  category: string;
  tags: string | null;
  confidence: number;
  memory_type: string;
  scope: string;
  replay_priority: number;
  ripple_tags: number;
  created_at: string;
  retired_at: string | null;
}

export interface AddMemoryInput {
  content: string;
  category?: string;
  tags?: string | string[];
  confidence?: number;
  memory_type?: string;
  scope?: string;
  agent_id?: string;
}

export interface SearchMemoryInput {
  query: string;
  limit?: number;
  memory_type?: string;
  agent_id?: string;
}

export function addMemory(input: AddMemoryInput): number {
  const db = getDb();
  const tags = Array.isArray(input.tags) ? input.tags.join(',') : (input.tags ?? null);

  const stmt = db.prepare(`
    INSERT INTO memories (agent_id, content, category, tags, confidence, memory_type, scope)
    VALUES (@agent_id, @content, @category, @tags, @confidence, @memory_type, @scope)
  `);

  const result = stmt.run({
    agent_id: input.agent_id ?? 'default',
    content: input.content,
    category: input.category ?? 'general',
    tags,
    confidence: input.confidence ?? 1.0,
    memory_type: input.memory_type ?? 'episodic',
    scope: input.scope ?? 'global',
  });

  return result.lastInsertRowid as number;
}

export function searchMemories(input: SearchMemoryInput): Memory[] {
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
    SELECT m.* FROM memories m
    JOIN memories_fts fts ON fts.rowid = m.id
    WHERE memories_fts MATCH @query
      AND m.agent_id = @agent_id
      AND m.retired_at IS NULL
  `;
  const params: Record<string, unknown> = { query: sanitized, agent_id: agentId, limit };

  if (input.memory_type) {
    sql += ' AND m.memory_type = @memory_type';
    params['memory_type'] = input.memory_type;
  }

  sql += ' ORDER BY rank LIMIT @limit';

  try {
    return db.prepare(sql).all(params) as Memory[];
  } catch {
    const fallback = `
      SELECT * FROM memories
      WHERE agent_id = @agent_id
        AND retired_at IS NULL
        AND content LIKE @like
      ${input.memory_type ? 'AND memory_type = @memory_type' : ''}
      ORDER BY created_at DESC
      LIMIT @limit
    `;
    const fp: Record<string, unknown> = { agent_id: agentId, like: `%${input.query}%`, limit };
    if (input.memory_type) fp['memory_type'] = input.memory_type;
    return db.prepare(fallback).all(fp) as Memory[];
  }
}

export function forgetMemory(id: number, agentId = 'default'): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE memories SET retired_at = datetime('now')
    WHERE id = @id AND agent_id = @agent_id AND retired_at IS NULL
  `).run({ id, agent_id: agentId });
  return result.changes > 0;
}

export function getMemory(id: number, agentId = 'default'): Memory | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM memories WHERE id = @id AND agent_id = @agent_id').get({ id, agent_id: agentId }) as Memory | undefined;
}
