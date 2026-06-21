import { getDb, isVecLoaded } from '../db/database.js';
import { isEmbeddingAvailable, EMBEDDING_DIMENSIONS } from './embeddings.service.js';
import { statSync } from 'fs';
import { join } from 'path';

export function getStats(agentId = 'default') {
  const db = getDb();

  const base = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM memories WHERE agent_id = @a AND retired_at IS NULL) AS memories,
      (SELECT COUNT(*) FROM memories WHERE agent_id = @a AND retired_at IS NOT NULL) AS retired_memories,
      (SELECT COUNT(*) FROM events WHERE agent_id = @a) AS events,
      (SELECT COUNT(*) FROM entities WHERE agent_id = @a) AS entities,
      (SELECT COUNT(*) FROM decisions WHERE agent_id = @a) AS decisions,
      (SELECT COUNT(*) FROM procedures WHERE agent_id = @a AND status = 'active') AS procedures,
      (SELECT COUNT(*) FROM triggers WHERE agent_id = @a AND active = 1) AS triggers,
      (SELECT COUNT(*) FROM handoffs WHERE agent_id = @a AND consumed_at IS NULL) AS pending_handoffs,
      (SELECT COUNT(*) FROM knowledge_edges) AS knowledge_edges
  `).get({ a: agentId }) as Record<string, number>;

  if (isVecLoaded()) {
    try {
      const vecStats = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM vec_memories) AS vec_memories,
          (SELECT COUNT(*) FROM vec_entities) AS vec_entities,
          (SELECT COUNT(*) FROM vec_events) AS vec_events
      `).get() as Record<string, number>;
      return { ...base, ...vecStats };
    } catch {
      // vec tables not yet created
    }
  }

  return base;
}

export function checkHealth(agentId = 'default') {
  const db = getDb();
  const issues: string[] = [];

  try {
    db.prepare('SELECT 1 FROM memories LIMIT 1').get();
  } catch {
    issues.push('memories table missing or corrupt');
  }

  let fts5Available = false;
  try {
    db.prepare("SELECT 1 FROM memories_fts WHERE memories_fts MATCH 'test' LIMIT 1").get();
    fts5Available = true;
  } catch {
    fts5Available = false;
  }

  let integrityOk = false;
  try {
    const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    integrityOk = result.integrity_check === 'ok';
    if (!integrityOk) issues.push(`integrity check: ${result.integrity_check}`);
  } catch {
    issues.push('integrity check failed');
  }

  const dbPath = process.env['BRAIN_DB'] ??
    join(process.env['HOME'] ?? '/tmp', 'brainctl', 'brain.db');

  let dbSizeMb = 0;
  try {
    dbSizeMb = statSync(dbPath).size / (1024 * 1024);
  } catch {
    // file may not exist yet
  }

  const stats = getStats(agentId);
  const vecAvailable = isVecLoaded();
  const embeddingAvailable = isEmbeddingAvailable();

  if (!vecAvailable) issues.push('sqlite-vec extension not loaded');
  if (!embeddingAvailable) issues.push('LITELLM_BASE_URL not set — embeddings disabled');

  return {
    ok: issues.filter((i) => !i.startsWith('sqlite-vec') && !i.startsWith('LITELLM')).length === 0,
    healthy: integrityOk,
    issues,
    fts5_available: fts5Available,
    vec_available: vecAvailable,
    embedding_available: embeddingAvailable,
    embedding_dimensions: EMBEDDING_DIMENSIONS,
    embedding_model: process.env['LITELLM_EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
    db_size_mb: Math.round(dbSizeMb * 100) / 100,
    db_path: dbPath,
    ...(stats as object),
  };
}
