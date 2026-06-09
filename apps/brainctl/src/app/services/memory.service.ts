import { getDb, isVecLoaded } from '../db/database.js';
import { embed, serializeVec } from './embeddings.service.js';

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
  recalled_count: number;
  temporal_class: string;
  last_accessed_at: string | null;
  compressed_into: number | null;
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

// Record that a set of memories were accessed: bump recalled_count,
// last_accessed_at, replay_priority, and ripple_tags in one UPDATE.
function recordAccess(ids: number[]): void {
  if (!ids.length) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`
    UPDATE memories
    SET recalled_count   = recalled_count + 1,
        last_accessed_at = datetime('now'),
        replay_priority  = min(1.0, replay_priority + 0.05),
        ripple_tags      = ripple_tags + 1
    WHERE id IN (${placeholders})
  `).run(...ids);
}

export async function addMemory(input: AddMemoryInput): Promise<number> {
  const db = getDb();
  const tags = Array.isArray(input.tags) ? input.tags.join(',') : (input.tags ?? null);

  const result = db.prepare(`
    INSERT INTO memories (agent_id, content, category, tags, confidence, memory_type, scope)
    VALUES (@agent_id, @content, @category, @tags, @confidence, @memory_type, @scope)
  `).run({
    agent_id: input.agent_id ?? 'default',
    content: input.content,
    category: input.category ?? 'general',
    tags,
    confidence: input.confidence ?? 1.0,
    memory_type: input.memory_type ?? 'episodic',
    scope: input.scope ?? 'global',
  });

  const id = result.lastInsertRowid as number;

  if (isVecLoaded()) {
    const vec = await embed(input.content);
    if (vec) {
      db.prepare('INSERT OR REPLACE INTO vec_memories(rowid, embedding) VALUES (?, ?)')
        .run(id, serializeVec(vec));
    }
  }

  return id;
}

export function searchMemoriesFts(input: SearchMemoryInput): Memory[] {
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
    const fp: Record<string, unknown> = { agent_id: agentId, like: `%${input.query}%`, limit };
    let fallback = `
      SELECT * FROM memories
      WHERE agent_id = @agent_id AND retired_at IS NULL AND content LIKE @like
    `;
    if (input.memory_type) {
      fallback += ' AND memory_type = @memory_type';
      fp['memory_type'] = input.memory_type;
    }
    fallback += ' ORDER BY created_at DESC LIMIT @limit';
    return db.prepare(fallback).all(fp) as Memory[];
  }
}

export async function searchMemoriesVec(input: SearchMemoryInput): Promise<Memory[]> {
  if (!isVecLoaded()) return [];

  const db = getDb();
  const vec = await embed(input.query);
  if (!vec) return [];

  const agentId = input.agent_id ?? 'default';
  const limit = input.limit ?? 10;

  try {
    return db.prepare(`
      SELECT m.*, v.distance
      FROM vec_memories v
      JOIN memories m ON m.id = v.rowid
      WHERE v.embedding MATCH ? AND k = ?
        AND m.agent_id = ?
        AND m.retired_at IS NULL
      ${input.memory_type ? 'AND m.memory_type = ?' : ''}
      ORDER BY v.distance
    `).all(
      ...(input.memory_type
        ? [serializeVec(vec), limit, agentId, input.memory_type]
        : [serializeVec(vec), limit, agentId])
    ) as Memory[];
  } catch {
    return [];
  }
}

// Hybrid search: FTS5 + vector, merged via RRF, then access recorded.
export async function searchMemories(input: SearchMemoryInput): Promise<Memory[]> {
  const [ftsResults, vecResults] = await Promise.all([
    searchMemoriesFts(input),
    searchMemoriesVec(input),
  ]);

  const merged = rrfMergeMemories(ftsResults, vecResults, input.limit ?? 10);
  recordAccess(merged.map((m) => m.id));
  return merged;
}

function rrfMergeMemories(fts: Memory[], vec: Memory[], limit: number): Memory[] {
  const K = 60;
  const scores = new Map<number, number>();
  const byId = new Map<number, Memory>();

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
  const memory = db.prepare(
    'SELECT * FROM memories WHERE id = @id AND agent_id = @agent_id'
  ).get({ id, agent_id: agentId }) as Memory | undefined;
  if (memory) recordAccess([memory.id]);
  return memory;
}

export function getMemoriesWithoutEmbeddings(agentId: string, limit: number): Memory[] {
  const db = getDb();
  return db.prepare(`
    SELECT m.* FROM memories m
    LEFT JOIN vec_memories v ON v.rowid = m.id
    WHERE m.agent_id = @agent_id AND m.retired_at IS NULL AND v.rowid IS NULL
    LIMIT @limit
  `).all({ agent_id: agentId, limit }) as Memory[];
}
