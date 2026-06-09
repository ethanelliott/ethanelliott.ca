import { getDb, isVecLoaded } from '../db/database.js';
import { searchMemories } from './memory.service.js';

// ---------------------------------------------------------------------------
// validate / lint — deep DB consistency checks
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  count?: number;
}

export function validateDatabase(agentId: string): {
  valid: boolean; issues: ValidationIssue[];
} {
  const db = getDb();
  const issues: ValidationIssue[] = [];

  // Orphaned FTS rows (FTS entry exists but base row is gone)
  try {
    const orphanedFts = db.prepare(`
      SELECT COUNT(*) AS c FROM memories_fts
      WHERE rowid NOT IN (SELECT id FROM memories)
    `).get() as { c: number };
    if (orphanedFts.c > 0) {
      issues.push({ severity: 'warning', code: 'FTS_ORPHAN_MEMORIES', message: 'FTS5 entries with no matching memory row', count: orphanedFts.c });
    }
  } catch { /* FTS not yet populated */ }

  // Missing embeddings
  if (isVecLoaded()) {
    try {
      const missingVec = db.prepare(`
        SELECT COUNT(*) AS c FROM memories m
        LEFT JOIN vec_memories v ON v.rowid = m.id
        WHERE m.agent_id = ? AND m.retired_at IS NULL AND v.rowid IS NULL
      `).get(agentId) as { c: number };
      if (missingVec.c > 0) {
        issues.push({ severity: 'info', code: 'MISSING_EMBEDDINGS', message: 'Active memories without vector embeddings', count: missingVec.c });
      }
    } catch { /* vec_memories not loaded */ }
  }

  // Broken knowledge edges (from_id or to_id points to retired/missing records)
  try {
    const brokenEdges = db.prepare(`
      SELECT COUNT(*) AS c FROM knowledge_edges ke
      WHERE (ke.from_type = 'memory' AND ke.from_id NOT IN (SELECT id FROM memories WHERE retired_at IS NULL))
         OR (ke.to_type   = 'memory' AND ke.to_id   NOT IN (SELECT id FROM memories WHERE retired_at IS NULL))
    `).get() as { c: number };
    if (brokenEdges.c > 0) {
      issues.push({ severity: 'warning', code: 'BROKEN_EDGES', message: 'Knowledge edges pointing to retired/missing records', count: brokenEdges.c });
    }
  } catch { /* skip */ }

  // Quarantined memories
  try {
    const quarantined = db.prepare(
      "SELECT COUNT(*) AS c FROM memories WHERE agent_id = ? AND quarantined_at IS NOT NULL AND retired_at IS NULL",
    ).get(agentId) as { c: number };
    if (quarantined.c > 0) {
      issues.push({ severity: 'info', code: 'QUARANTINED', message: 'Memories in quarantine pending review', count: quarantined.c });
    }
  } catch { /* quarantined_at column may not exist */ }

  // Zero-content entities
  try {
    const emptyEntities = db.prepare(`
      SELECT COUNT(*) AS c FROM entities
      WHERE agent_id = ? AND (observations IS NULL OR observations = '')
        AND (compiled_truth IS NULL OR compiled_truth = '')
    `).get(agentId) as { c: number };
    if (emptyEntities.c > 0) {
      issues.push({ severity: 'info', code: 'EMPTY_ENTITIES', message: 'Entities with no observations or compiled truth', count: emptyEntities.c });
    }
  } catch { /* skip */ }

  // SQLite integrity
  try {
    const check = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (check.integrity_check !== 'ok') {
      issues.push({ severity: 'critical', code: 'INTEGRITY_FAIL', message: check.integrity_check });
    }
  } catch {
    issues.push({ severity: 'critical', code: 'INTEGRITY_ERROR', message: 'Failed to run integrity check' });
  }

  const valid = !issues.some((i) => i.severity === 'critical');
  return { valid, issues };
}

// ---------------------------------------------------------------------------
// free_energy_check — homeostatic memory pressure
// Pressure = active_memories / capacity_target, clamped to [0, 1].
// A score above 0.9 signals the consolidation engine should run immediately.
// Named after the free-energy principle (Friston): high pressure = high
// prediction error in the generative model of the memory store.
// ---------------------------------------------------------------------------

export function freeEnergyCheck(agentId: string, capacityTarget = 10000): {
  pressure: number;
  active_memories: number;
  capacity_target: number;
  retired_ratio: number;
  quarantine_ratio: number;
  low_confidence_ratio: number;
  recommendations: string[];
} {
  const db = getDb();

  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN retired_at IS NULL AND quarantined_at IS NULL THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN retired_at IS NOT NULL THEN 1 ELSE 0 END) AS retired,
      SUM(CASE WHEN quarantined_at IS NOT NULL AND retired_at IS NULL THEN 1 ELSE 0 END) AS quarantined,
      SUM(CASE WHEN confidence < 0.4 AND retired_at IS NULL THEN 1 ELSE 0 END) AS low_conf,
      COUNT(*) AS total
    FROM memories WHERE agent_id = ?
  `).get(agentId) as { active: number; retired: number; quarantined: number; low_conf: number; total: number };

  const active = counts.active ?? 0;
  const total = counts.total ?? 1;
  const pressure = Math.min(1, active / capacityTarget);
  const retired_ratio = (counts.retired ?? 0) / Math.max(total, 1);
  const quarantine_ratio = (counts.quarantined ?? 0) / Math.max(active, 1);
  const low_confidence_ratio = (counts.low_conf ?? 0) / Math.max(active, 1);

  const recommendations: string[] = [];
  if (pressure > 0.9) recommendations.push('Run consolidation cycle immediately — memory store near capacity');
  if (pressure > 0.7) recommendations.push('Consider retiring low-confidence memories');
  if (low_confidence_ratio > 0.3) recommendations.push('High proportion of low-confidence memories — run retirement analysis');
  if (quarantine_ratio > 0.1) recommendations.push('Many quarantined memories — review and retire or release');
  if (retired_ratio > 0.5) recommendations.push('Large retired backlog — run admin/memories/retired purge');

  return { pressure, active_memories: active, capacity_target: capacityTarget, retired_ratio, quarantine_ratio, low_confidence_ratio, recommendations };
}

// ---------------------------------------------------------------------------
// allostatic_prime — surface memories near decay threshold before consolidation
// decay_risk ≈ 1 / remaining_half_lives: a memory needing 0.1 more half-lives
// to hit the retire threshold has risk ≈ 1, while one needing 10 has risk ≈ 0.1.
// ---------------------------------------------------------------------------

export function allostaticPrime(agentId: string, limit = 20): Array<{
  id: number; content: string; confidence: number; temporal_class: string;
  days_old: number; decay_risk: number;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, content, confidence, temporal_class, created_at
    FROM memories
    WHERE agent_id = ? AND retired_at IS NULL AND quarantined_at IS NULL
      AND confidence BETWEEN 0.15 AND 0.45
    ORDER BY confidence ASC, created_at ASC
    LIMIT ?
  `).all(agentId, limit) as Array<{
    id: number; content: string; confidence: number;
    temporal_class: string; created_at: string;
  }>;

  const halfLifeDays: Record<string, number> = {
    ephemeral: 3.5, short: 10, medium: 23, long: 69,
  };

  return rows.map((r) => {
    const days = (Date.now() - new Date(r.created_at).getTime()) / 86400000;
    const hl = halfLifeDays[r.temporal_class] ?? 23;
    // Remaining half-lives before hitting 0.1 threshold
    const remainingDecayFraction = Math.log2(r.confidence / 0.1) * (hl / days || 1);
    const decay_risk = Math.min(1, 1 / Math.max(0.1, remainingDecayFraction));
    return {
      id: r.id, content: r.content, confidence: r.confidence,
      temporal_class: r.temporal_class, days_old: Math.round(days), decay_risk,
    };
  }).sort((a, b) => b.decay_risk - a.decay_risk);
}

// ---------------------------------------------------------------------------
// demand_forecast — predict future high-access memories from recall trends
// ---------------------------------------------------------------------------

export function demandForecast(agentId: string, limit = 20): Array<{
  id: number; content: string; recalled_count: number;
  recency_score: number; predicted_demand: number;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, content, recalled_count, last_accessed_at, created_at
    FROM memories
    WHERE agent_id = ? AND retired_at IS NULL AND recalled_count > 0
    ORDER BY recalled_count DESC
    LIMIT ?
  `).all(agentId, limit * 2) as Array<{
    id: number; content: string; recalled_count: number;
    last_accessed_at: string | null; created_at: string;
  }>;

  const now = Date.now();
  return rows.map((r) => {
    const daysSinceAccess = r.last_accessed_at
      ? (now - new Date(r.last_accessed_at).getTime()) / 86400000
      : (now - new Date(r.created_at).getTime()) / 86400000;
    // Recency-weighted score: recent access + high recall = high demand
    const recency_score = Math.exp(-daysSinceAccess / 7);
    const predicted_demand = (r.recalled_count * recency_score) / Math.max(1, daysSinceAccess);
    return { id: r.id, content: r.content, recalled_count: r.recalled_count, recency_score, predicted_demand };
  })
    .sort((a, b) => b.predicted_demand - a.predicted_demand)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// retrieval_effectiveness — offline precision/recall for search
// ---------------------------------------------------------------------------

export async function retrievalEffectiveness(input: {
  test_cases: Array<{ query: string; expected_ids: number[] }>;
  agent_id?: string; k?: number;
}): Promise<{
  precision_at_k: number;
  recall_at_k: number;
  cases: Array<{ query: string; retrieved_ids: number[]; precision: number; recall: number }>;
}> {
  const agentId = input.agent_id ?? 'default';
  const k = input.k ?? 5;

  const cases = await Promise.all(input.test_cases.map(async (tc) => {
    const results = await searchMemories({ query: tc.query, limit: k, agent_id: agentId });
    const retrieved = new Set(results.map((r) => r.id));
    const expected = new Set(tc.expected_ids);
    const hits = [...retrieved].filter((id) => expected.has(id)).length;

    return {
      query: tc.query,
      retrieved_ids: [...retrieved],
      precision: retrieved.size > 0 ? hits / retrieved.size : 0,
      recall: expected.size > 0 ? hits / expected.size : 0,
    };
  }));

  const avg = (key: 'precision' | 'recall') =>
    cases.length > 0 ? cases.reduce((s, c) => s + c[key], 0) / cases.length : 0;

  return { precision_at_k: avg('precision'), recall_at_k: avg('recall'), cases };
}
