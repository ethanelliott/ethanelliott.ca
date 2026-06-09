import { getDb, isVecLoaded } from '../db/database.js';
import { embed, serializeVec } from './embeddings.service.js';

export interface ContextChunk {
  id: number;
  agent_id: string;
  document: string;
  chunk_index: number;
  content: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentSummary {
  document: string;
  chunks: number;
  last_updated: string;
}

function ensureContextTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS context (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      document TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_context_doc_chunk_agent
      ON context(document, chunk_index, agent_id);
    CREATE INDEX IF NOT EXISTS idx_context_agent ON context(agent_id);
    CREATE INDEX IF NOT EXISTS idx_context_document ON context(document, agent_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS context_fts USING fts5(
      content, document, metadata,
      content='context', content_rowid='id'
    );
    CREATE TRIGGER IF NOT EXISTS context_ai AFTER INSERT ON context BEGIN
      INSERT INTO context_fts(rowid, content, document, metadata)
      VALUES (new.id, new.content, new.document, COALESCE(new.metadata, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS context_au AFTER UPDATE ON context BEGIN
      INSERT INTO context_fts(context_fts, rowid, content, document, metadata)
      VALUES ('delete', old.id, old.content, old.document, COALESCE(old.metadata, ''));
      INSERT INTO context_fts(rowid, content, document, metadata)
      VALUES (new.id, new.content, new.document, COALESCE(new.metadata, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS context_ad AFTER DELETE ON context BEGIN
      INSERT INTO context_fts(context_fts, rowid, content, document, metadata)
      VALUES ('delete', old.id, old.content, old.document, COALESCE(old.metadata, ''));
    END;
  `);
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - overlap);

  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + chunkSize).join(' ');
    if (slice) chunks.push(slice);
    if (i + chunkSize >= words.length) break;
  }

  return chunks;
}

export async function ingestDocument(input: {
  document: string;
  content: string;
  agent_id?: string;
  chunk_size?: number;
  overlap?: number;
  metadata?: string;
}): Promise<{ document: string; chunks: number; ids: number[] }> {
  ensureContextTable();
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const chunkSize = input.chunk_size ?? 300;
  const overlap = input.overlap ?? 50;

  // Remove existing chunks for this document before reingest
  const existing = db.prepare('SELECT id FROM context WHERE document = ? AND agent_id = ?')
    .all(input.document, agentId) as Array<{ id: number }>;
  if (existing.length) {
    const ids = existing.map((r) => r.id);
    db.prepare(`DELETE FROM context WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    if (isVecLoaded()) {
      db.prepare(`DELETE FROM vec_context WHERE rowid IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
  }

  const chunks = chunkText(input.content, chunkSize, overlap);
  const insertedIds: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const result = db.prepare(`
      INSERT INTO context (agent_id, document, chunk_index, content, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(agentId, input.document, i, chunks[i], input.metadata ?? null);
    const rowId = result.lastInsertRowid as number;
    insertedIds.push(rowId);

    if (isVecLoaded()) {
      const vec = await embed(chunks[i]);
      if (vec) {
        db.prepare('INSERT OR REPLACE INTO vec_context(rowid, embedding) VALUES (?, ?)')
          .run(rowId, serializeVec(vec));
      }
    }
  }

  return { document: input.document, chunks: chunks.length, ids: insertedIds };
}

export function getDocument(document: string, agentId: string): ContextChunk[] {
  ensureContextTable();
  return getDb()
    .prepare('SELECT * FROM context WHERE document = ? AND agent_id = ? ORDER BY chunk_index')
    .all(document, agentId) as ContextChunk[];
}

export function listDocuments(agentId: string): DocumentSummary[] {
  ensureContextTable();
  return getDb().prepare(`
    SELECT document, COUNT(*) AS chunks, MAX(updated_at) AS last_updated
    FROM context WHERE agent_id = ?
    GROUP BY document ORDER BY last_updated DESC
  `).all(agentId) as DocumentSummary[];
}

export function deleteDocument(document: string, agentId: string): number {
  ensureContextTable();
  const db = getDb();
  const rows = db.prepare('SELECT id FROM context WHERE document = ? AND agent_id = ?')
    .all(document, agentId) as Array<{ id: number }>;
  if (!rows.length) return 0;

  const ids = rows.map((r) => r.id);
  if (isVecLoaded()) {
    db.prepare(`DELETE FROM vec_context WHERE rowid IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
  const result = db.prepare(`DELETE FROM context WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  return result.changes;
}

export async function searchContext(input: {
  query: string;
  agent_id?: string;
  document?: string;
  limit?: number;
}): Promise<Array<ContextChunk & { score: number }>> {
  ensureContextTable();
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const limit = input.limit ?? 10;
  const docFilter = input.document ? 'AND c.document = ?' : '';
  const docParams: unknown[] = input.document ? [input.document] : [];

  // FTS5 results
  const ftsRows = db.prepare(`
    SELECT c.*, cf.rank AS fts_rank
    FROM context_fts cf
    JOIN context c ON c.id = cf.rowid
    WHERE context_fts MATCH ? AND c.agent_id = ? ${docFilter}
    ORDER BY cf.rank LIMIT ?
  `).all(input.query, agentId, ...docParams, limit * 2) as Array<ContextChunk & { fts_rank: number }>;

  const ftsMap = new Map<number, number>();
  ftsRows.forEach((r, i) => ftsMap.set(r.id, i + 1));

  // Vector results (if available)
  const vecMap = new Map<number, number>();
  if (isVecLoaded()) {
    const vec = await embed(input.query);
    if (vec) {
      const vecRows = db.prepare(`
        SELECT c.id, v.distance
        FROM vec_context v
        JOIN context c ON c.id = v.rowid
        WHERE c.agent_id = ? ${docFilter}
        ORDER BY v.distance LIMIT ?
      `).all(agentId, ...docParams, limit * 2) as Array<{ id: number; distance: number }>;
      vecRows.forEach((r, i) => vecMap.set(r.id, i + 1));
    }
  }

  // RRF merge (K=60)
  const K = 60;
  const allIds = new Set([...ftsMap.keys(), ...vecMap.keys()]);
  const scored = Array.from(allIds).map((id) => {
    const ftsRank = ftsMap.has(id) ? 1 / (K + ftsMap.get(id)!) : 0;
    const vecRank = vecMap.has(id) ? 1 / (K + vecMap.get(id)!) : 0;
    return { id, score: ftsRank + vecRank };
  });

  scored.sort((a, b) => b.score - a.score);
  const topIds = scored.slice(0, limit).map((s) => s.id);
  if (!topIds.length) return [];

  const rows = db.prepare(
    `SELECT * FROM context WHERE id IN (${topIds.map(() => '?').join(',')})`,
  ).all(...topIds) as ContextChunk[];

  const rowMap = new Map(rows.map((r) => [r.id, r]));
  return topIds
    .filter((id) => rowMap.has(id))
    .map((id) => ({ ...rowMap.get(id)!, score: scored.find((s) => s.id === id)!.score }));
}
