import { getDb } from '../db/database.js';

export interface KnowledgeEdge {
  id: number;
  from_type: string;
  from_id: number;
  relation: string;
  to_type: string;
  to_id: number;
  weight: number;
  created_at: string;
}

export interface EpochRecord {
  id: number;
  agent_id: string;
  label: string;
  starts_at: string;
  ends_at: string | null;
  description: string | null;
  created_at: string;
}

function ensureEpochTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS epochs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      label TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_epochs_label_agent ON epochs(label, agent_id);
    CREATE INDEX IF NOT EXISTS idx_epochs_agent ON epochs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_epochs_starts ON epochs(starts_at);
  `);
}

// ---------------------------------------------------------------------------
// weights — direct CRUD for knowledge edge weights
// ---------------------------------------------------------------------------

export function listEdges(input: {
  from_type?: string; from_id?: number;
  to_type?: string; to_id?: number;
  relation?: string; limit?: number;
}): KnowledgeEdge[] {
  const db = getDb();
  let sql = 'SELECT * FROM knowledge_edges WHERE 1=1';
  const params: unknown[] = [];

  if (input.from_type) { sql += ' AND from_type = ?'; params.push(input.from_type); }
  if (input.from_id !== undefined) { sql += ' AND from_id = ?'; params.push(input.from_id); }
  if (input.to_type) { sql += ' AND to_type = ?'; params.push(input.to_type); }
  if (input.to_id !== undefined) { sql += ' AND to_id = ?'; params.push(input.to_id); }
  if (input.relation) { sql += ' AND relation = ?'; params.push(input.relation); }

  sql += ' ORDER BY weight DESC LIMIT ?';
  params.push(input.limit ?? 50);

  return db.prepare(sql).all(...params) as KnowledgeEdge[];
}

export function setEdgeWeight(id: number, weight: number): boolean {
  return getDb().prepare(
    'UPDATE knowledge_edges SET weight = ? WHERE id = ?',
  ).run(Math.max(0, weight), id).changes > 0;
}

export function createEdge(input: {
  from_type: string; from_id: number;
  relation: string;
  to_type: string; to_id: number;
  weight?: number;
}): number {
  const result = getDb().prepare(`
    INSERT INTO knowledge_edges (from_type, from_id, relation, to_type, to_id, weight)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.from_type, input.from_id, input.relation,
    input.to_type, input.to_id, input.weight ?? 1.0,
  );
  return result.lastInsertRowid as number;
}

export function deleteEdge(id: number): boolean {
  return getDb().prepare('DELETE FROM knowledge_edges WHERE id = ?').run(id).changes > 0;
}

// ---------------------------------------------------------------------------
// event_link — explicitly link an event to memories / entities
// ---------------------------------------------------------------------------

export function linkEvent(input: {
  event_id: number;
  targets: Array<{ type: 'memory' | 'entity'; id: number; relation?: string }>;
  weight?: number;
}): number[] {
  const db = getDb();
  const ids: number[] = [];

  for (const target of input.targets) {
    const result = db.prepare(`
      INSERT INTO knowledge_edges (from_type, from_id, relation, to_type, to_id, weight)
      VALUES ('event', ?, ?, ?, ?, ?)
    `).run(
      input.event_id,
      target.relation ?? 'related_to',
      target.type,
      target.id,
      input.weight ?? 1.0,
    );
    ids.push(result.lastInsertRowid as number);
  }

  return ids;
}

export function getEventLinks(eventId: number): KnowledgeEdge[] {
  return getDb().prepare(
    "SELECT * FROM knowledge_edges WHERE from_type = 'event' AND from_id = ? ORDER BY weight DESC",
  ).all(eventId) as KnowledgeEdge[];
}

// ---------------------------------------------------------------------------
// epoch — temporal segmentation of the memory store
// ---------------------------------------------------------------------------

export function createEpoch(input: {
  label: string; starts_at: string; ends_at?: string;
  description?: string; agent_id?: string;
}): number {
  ensureEpochTable();
  const result = getDb().prepare(`
    INSERT INTO epochs (agent_id, label, starts_at, ends_at, description)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (label, agent_id) DO UPDATE SET
      starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      description = excluded.description
  `).run(
    input.agent_id ?? 'default',
    input.label, input.starts_at,
    input.ends_at ?? null, input.description ?? null,
  );
  return result.lastInsertRowid as number;
}

export function closeEpoch(label: string, agentId: string, endsAt?: string): boolean {
  ensureEpochTable();
  return getDb().prepare(`
    UPDATE epochs SET ends_at = COALESCE(?, datetime('now'))
    WHERE label = ? AND agent_id = ? AND ends_at IS NULL
  `).run(endsAt ?? null, label, agentId).changes > 0;
}

export function listEpochs(agentId: string): EpochRecord[] {
  ensureEpochTable();
  return getDb().prepare(
    'SELECT * FROM epochs WHERE agent_id = ? ORDER BY starts_at DESC',
  ).all(agentId) as EpochRecord[];
}

export function getEpochMemories(label: string, agentId: string, limit = 50) {
  ensureEpochTable();
  const db = getDb();
  const epoch = db.prepare('SELECT * FROM epochs WHERE label = ? AND agent_id = ?')
    .get(label, agentId) as EpochRecord | undefined;

  if (!epoch) return { epoch: null, memories: [] };

  let sql = `
    SELECT * FROM memories
    WHERE agent_id = ? AND retired_at IS NULL
      AND created_at >= ?
  `;
  const params: unknown[] = [agentId, epoch.starts_at];

  if (epoch.ends_at) { sql += ' AND created_at <= ?'; params.push(epoch.ends_at); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const memories = db.prepare(sql).all(...params);
  return { epoch, memories };
}
