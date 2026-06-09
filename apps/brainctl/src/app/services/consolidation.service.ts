import Database from 'better-sqlite3';
import { getDb, isVecLoaded } from '../db/database.js';
import { embed, serializeVec, embedBatch } from './embeddings.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidationPassResult {
  pass: string;
  processed: number;
  promoted?: number;
  retired?: number;
  edges_created?: number;
  edges_pruned?: number;
  clusters?: number;
  issues?: string[];
  duration_ms: number;
  dry_run: boolean;
}

export interface ConsolidationReport {
  agent_id: string;
  started_at: string;
  completed_at: string;
  passes: ConsolidationPassResult[];
  total_duration_ms: number;
  dry_run: boolean;
}

export interface ConsolidationOptions {
  decay_rate?: number;
  protect_confidence?: number;
  protect_recall_min?: number;
  retire_threshold?: number;
  promote_min_priority?: number;
  promote_min_ripple_tags?: number;
  promote_min_confidence?: number;
  compression_min_cluster?: number;
  vec_similarity_threshold?: number;
  fts_overlap_threshold?: number;
  hebbian_boost?: number;
  hebbian_decay?: number;
  prune_threshold?: number;
  passes?: Array<'decay' | 'promote' | 'compress' | 'hebbian' | 'gap_scan' | 'entity_tiers'>;
  dry_run?: boolean;
  batch_limit?: number;
}

const DEFAULTS = {
  decay_rate: 0.05,
  protect_confidence: 0.8,
  protect_recall_min: 10,
  retire_threshold: 0.1,
  promote_min_priority: 0.3,
  promote_min_ripple_tags: 3,
  promote_min_confidence: 0.7,
  compression_min_cluster: 3,
  vec_similarity_threshold: 0.18,
  fts_overlap_threshold: 0.4,
  hebbian_boost: 0.1,
  hebbian_decay: 0.02,
  prune_threshold: 0.05,
  batch_limit: 500,
};

// Half-life in days per temporal class.
// Exponential decay formula: confidence(t) = confidence(0) × e^(-λt), λ = ln2/half_life
// A memory at 0.5 confidence with 'short' class drops below the 0.1 retire threshold
// after ~33 days without reinforcement.
const HALF_LIVES: Record<string, number> = {
  ephemeral: 3.5,
  short: 10,
  medium: 23,
  long: 69,
};

// ---------------------------------------------------------------------------
// Pass 1 — Decay
// ---------------------------------------------------------------------------

export function runDecayPass(agentId: string, opts: ConsolidationOptions): ConsolidationPassResult {
  const t0 = Date.now();
  const db = getDb();
  const dryRun = opts.dry_run ?? false;
  const protectConf = opts.protect_confidence ?? DEFAULTS.protect_confidence;
  const protectRecall = opts.protect_recall_min ?? DEFAULTS.protect_recall_min;
  const retireThreshold = opts.retire_threshold ?? DEFAULTS.retire_threshold;
  const limit = opts.batch_limit ?? DEFAULTS.batch_limit;

  const memories = db.prepare(`
    SELECT id, confidence, recalled_count, temporal_class, created_at
    FROM memories
    WHERE agent_id = @agent_id AND retired_at IS NULL
    LIMIT @limit
  `).all({ agent_id: agentId, limit }) as Array<{
    id: number; confidence: number; recalled_count: number;
    temporal_class: string; created_at: string;
  }>;

  let processed = 0;
  let retired = 0;
  const now = Date.now();

  const updates: Array<{ id: number; confidence: number; temporal_class: string; retire: boolean }> = [];

  for (const m of memories) {
    // Protected memories skip decay
    if (m.confidence >= protectConf && m.recalled_count >= protectRecall) continue;

    const ageDays = (now - new Date(m.created_at).getTime()) / 86_400_000;
    const temporalClass = classifyTemporalClass(ageDays, m.temporal_class);
    const halfLife = HALF_LIVES[temporalClass] ?? HALF_LIVES.medium;
    const lambda = Math.LN2 / halfLife;
    const decayed = m.confidence * Math.exp(-lambda * ageDays);
    const newConf = Math.max(0, Math.min(1, decayed));

    processed++;
    updates.push({
      id: m.id,
      confidence: newConf,
      temporal_class: temporalClass,
      retire: newConf < retireThreshold,
    });
    if (newConf < retireThreshold) retired++;
  }

  if (!dryRun && updates.length) {
    const updateStmt = db.prepare(`
      UPDATE memories SET confidence = @conf, temporal_class = @tc
      WHERE id = @id
    `);
    const retireStmt = db.prepare(`
      UPDATE memories SET retired_at = datetime('now'), confidence = @conf, temporal_class = @tc
      WHERE id = @id
    `);
    const tx = db.transaction(() => {
      for (const u of updates) {
        if (u.retire) retireStmt.run({ conf: u.confidence, tc: u.temporal_class, id: u.id });
        else updateStmt.run({ conf: u.confidence, tc: u.temporal_class, id: u.id });
      }
    });
    tx();
  }

  return { pass: 'decay', processed, retired, duration_ms: Date.now() - t0, dry_run: dryRun };
}

function classifyTemporalClass(ageDays: number, current: string): string {
  if (ageDays < 7) return 'ephemeral';
  if (ageDays < 30) return 'short';
  if (ageDays < 90) return 'medium';
  return 'long';
}

// ---------------------------------------------------------------------------
// Pass 2 — Promotion (episodic → semantic)
// ---------------------------------------------------------------------------

export function runPromotionPass(agentId: string, opts: ConsolidationOptions): ConsolidationPassResult {
  const t0 = Date.now();
  const db = getDb();
  const dryRun = opts.dry_run ?? false;
  const minPriority = opts.promote_min_priority ?? DEFAULTS.promote_min_priority;
  const minRipple = opts.promote_min_ripple_tags ?? DEFAULTS.promote_min_ripple_tags;
  const minConf = opts.promote_min_confidence ?? DEFAULTS.promote_min_confidence;
  const limit = opts.batch_limit ?? DEFAULTS.batch_limit;

  const candidates = db.prepare(`
    SELECT id FROM memories
    WHERE agent_id = @agent_id
      AND memory_type = 'episodic'
      AND retired_at IS NULL
      AND replay_priority >= @min_priority
      AND ripple_tags >= @min_ripple
      AND confidence >= @min_conf
    ORDER BY replay_priority DESC
    LIMIT @limit
  `).all({ agent_id: agentId, min_priority: minPriority, min_ripple: minRipple, min_conf: minConf, limit }) as Array<{ id: number }>;

  if (!dryRun && candidates.length) {
    const stmt = db.prepare(`
      UPDATE memories
      SET memory_type = 'semantic', replay_priority = 0, ripple_tags = 0
      WHERE id = @id
    `);
    const tx = db.transaction(() => { for (const c of candidates) stmt.run({ id: c.id }); });
    tx();
  }

  return { pass: 'promote', processed: candidates.length, promoted: candidates.length, duration_ms: Date.now() - t0, dry_run: dryRun };
}

// ---------------------------------------------------------------------------
// Pass 3 — Compression (cluster similar memories, merge each cluster)
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: number; content: string; category: string; scope: string;
  confidence: number; tags: string | null; agent_id: string;
}

export async function runCompressionPass(agentId: string, opts: ConsolidationOptions): Promise<ConsolidationPassResult> {
  const t0 = Date.now();
  const db = getDb();
  const dryRun = opts.dry_run ?? false;
  const minCluster = opts.compression_min_cluster ?? DEFAULTS.compression_min_cluster;
  const vecThreshold = opts.vec_similarity_threshold ?? DEFAULTS.vec_similarity_threshold;
  const ftsThreshold = opts.fts_overlap_threshold ?? DEFAULTS.fts_overlap_threshold;
  const limit = opts.batch_limit ?? DEFAULTS.batch_limit;

  const memories = db.prepare(`
    SELECT id, content, category, scope, confidence, tags, agent_id
    FROM memories
    WHERE agent_id = @agent_id AND retired_at IS NULL AND compressed_into IS NULL
    ORDER BY confidence ASC
    LIMIT @limit
  `).all({ agent_id: agentId, limit }) as MemoryRow[];

  if (memories.length < minCluster) {
    return { pass: 'compress', processed: 0, clusters: 0, retired: 0, duration_ms: Date.now() - t0, dry_run: dryRun };
  }

  const clusters = isVecLoaded()
    ? await buildVecClusters(db, memories, vecThreshold, minCluster)
    : buildFtsClusters(db, memories, ftsThreshold, minCluster);

  let retired = 0;
  let clustersCreated = 0;

  if (!dryRun) {
    for (const cluster of clusters) {
      const merged = mergeCluster(cluster);
      const insertResult = db.prepare(`
        INSERT INTO memories (agent_id, content, category, tags, confidence, memory_type, scope, ripple_tags)
        VALUES (@agent_id, @content, @category, @tags, @confidence, 'semantic', @scope, @ripple_tags)
      `).run({
        agent_id: agentId,
        content: merged.content,
        category: merged.category,
        scope: merged.scope,
        tags: merged.tags,
        confidence: merged.confidence,
        ripple_tags: cluster.length,
      });

      const newId = insertResult.lastInsertRowid as number;

      const retireStmt = db.prepare(`
        UPDATE memories SET retired_at = datetime('now'), compressed_into = @into
        WHERE id = @id
      `);
      const tx = db.transaction(() => {
        for (const m of cluster) retireStmt.run({ into: newId, id: m.id });
      });
      tx();

      // Migrate edges from retired memories to the new merged memory
      db.prepare(`
        UPDATE knowledge_edges SET from_id = @new WHERE from_type = 'memory' AND from_id IN (${cluster.map(() => '?').join(',')})
      `).run(newId, ...cluster.map((m) => m.id));
      db.prepare(`
        UPDATE knowledge_edges SET to_id = @new WHERE to_type = 'memory' AND to_id IN (${cluster.map(() => '?').join(',')})
      `).run(newId, ...cluster.map((m) => m.id));

      // Embed the merged memory if vec is available
      if (isVecLoaded()) {
        const vec = await embed(merged.content);
        if (vec) {
          db.prepare('INSERT OR REPLACE INTO vec_memories(rowid, embedding) VALUES (?, ?)').run(newId, serializeVec(vec));
        }
      }

      retired += cluster.length;
      clustersCreated++;
    }
  }

  return {
    pass: 'compress',
    processed: memories.length,
    clusters: dryRun ? clusters.length : clustersCreated,
    retired,
    duration_ms: Date.now() - t0,
    dry_run: dryRun,
  };
}

async function buildVecClusters(
  db: Database.Database,
  memories: MemoryRow[],
  threshold: number,
  minSize: number
): Promise<MemoryRow[][]> {
  // Union-find with path compression: amortised O(α(n)) per lookup.
  // For each memory we query its K=10 nearest neighbours; any pair within
  // vec_similarity_threshold distance is merged into the same cluster root.
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    if (parent.get(id) === id) return id;
    const root = find(parent.get(id)!);
    parent.set(id, root);
    return root;
  };
  const union = (a: number, b: number) => { parent.set(find(a), find(b)); };

  for (const m of memories) parent.set(m.id, m.id);

  for (const m of memories) {
    try {
      const neighbors = db.prepare(`
        SELECT v.rowid, v.distance FROM vec_memories v
        WHERE v.embedding MATCH (SELECT embedding FROM vec_memories WHERE rowid = ?) AND k = 10
        AND v.distance <= ? AND v.rowid != ?
        ORDER BY v.distance
      `).all(m.id, threshold, m.id) as Array<{ rowid: number; distance: number }>;

      for (const n of neighbors) {
        if (parent.has(n.rowid)) union(m.id, n.rowid);
      }
    } catch {
      // vec_memories entry may not exist for this memory
    }
  }

  return collectClusters(memories, find, minSize);
}

function buildFtsClusters(
  db: Database.Database,
  memories: MemoryRow[],
  threshold: number,
  minSize: number
): MemoryRow[][] {
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    if (parent.get(id) === id) return id;
    const root = find(parent.get(id)!);
    parent.set(id, root);
    return root;
  };
  const union = (a: number, b: number) => { parent.set(find(a), find(b)); };

  for (const m of memories) parent.set(m.id, m.id);

  // Group by (category, scope) before pairwise Jaccard — reduces O(n²) to
  // O(k²) per group where k << n. Each group is further capped at 80 to
  // prevent runaway comparisons in categories with many similar memories.
  const byCategory = new Map<string, MemoryRow[]>();
  for (const m of memories) {
    const key = `${m.category}::${m.scope}`;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(m);
  }

  for (const group of byCategory.values()) {
    if (group.length < 2) continue;
    // Cap group size to avoid O(n²) blowup
    const sample = group.slice(0, 80);
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        if (jaccardSimilarity(sample[i].content, sample[j].content) >= threshold) {
          union(sample[i].id, sample[j].id);
        }
      }
    }
  }

  return collectClusters(memories, find, minSize);
}

function collectClusters(memories: MemoryRow[], find: (id: number) => number, minSize: number): MemoryRow[][] {
  const groups = new Map<number, MemoryRow[]>();
  for (const m of memories) {
    const root = find(m.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(m);
  }
  return Array.from(groups.values()).filter((g) => g.length >= minSize);
}

function jaccardSimilarity(a: string, b: string): number {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  const intersection = new Set([...tokA].filter((t) => tokB.has(t)));
  const union = new Set([...tokA, ...tokB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function mergeCluster(cluster: MemoryRow[]): { content: string; category: string; scope: string; tags: string | null; confidence: number } {
  // Sort by confidence descending; primary content comes from most confident member
  const sorted = [...cluster].sort((a, b) => b.confidence - a.confidence);
  const primary = sorted[0];

  const uniqueSentences = dedupeSentences(cluster.map((m) => m.content));
  const content = uniqueSentences.slice(0, 6).join(' ');

  const allTags = cluster.flatMap((m) => (m.tags ? m.tags.split(',') : []));
  const tags = [...new Set(allTags)].join(',') || null;

  const avgConf = cluster.reduce((s, m) => s + m.confidence, 0) / cluster.length;

  return {
    content,
    category: primary.category,
    scope: primary.scope,
    tags,
    confidence: Math.min(1, avgConf * 1.1),
  };
}

function dedupeSentences(texts: string[]): string[] {
  const sentences = texts.flatMap((t) => t.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean));
  const seen = new Set<string>();
  return sentences.filter((s) => {
    const key = s.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Pass 4 — Hebbian (strengthen edges between high-confidence co-activations)
// ---------------------------------------------------------------------------

export function runHebbianPass(agentId: string, opts: ConsolidationOptions): ConsolidationPassResult {
  const t0 = Date.now();
  const db = getDb();
  const dryRun = opts.dry_run ?? false;
  const boost = opts.hebbian_boost ?? DEFAULTS.hebbian_boost;
  const decay = opts.hebbian_decay ?? DEFAULTS.hebbian_decay;
  const pruneAt = opts.prune_threshold ?? DEFAULTS.prune_threshold;

  // Get all edges touching this agent's memories
  const edges = db.prepare(`
    SELECT ke.id, ke.weight, ke.from_id, ke.to_id,
           mf.confidence AS from_conf, mf.retired_at AS from_retired,
           mt.confidence AS to_conf, mt.retired_at AS to_retired
    FROM knowledge_edges ke
    JOIN memories mf ON mf.id = ke.from_id
    JOIN memories mt ON mt.id = ke.to_id
    WHERE ke.from_type = 'memory' AND ke.to_type = 'memory'
      AND mf.agent_id = @agent_id
  `).all({ agent_id: agentId }) as Array<{
    id: number; weight: number; from_id: number; to_id: number;
    from_conf: number; from_retired: string | null;
    to_conf: number; to_retired: string | null;
  }>;

  const toUpdate: Array<{ id: number; weight: number }> = [];
  const toPrune: number[] = [];

  for (const e of edges) {
    const eitherRetired = e.from_retired || e.to_retired;
    if (eitherRetired) {
      toPrune.push(e.id);
      continue;
    }

    const bothStrong = e.from_conf >= 0.6 && e.to_conf >= 0.6;
    const newWeight = bothStrong
      ? Math.min(2.0, e.weight + boost)
      : Math.max(0, e.weight - decay);

    if (newWeight < pruneAt) toPrune.push(e.id);
    else toUpdate.push({ id: e.id, weight: newWeight });
  }

  if (!dryRun) {
    const updateStmt = db.prepare('UPDATE knowledge_edges SET weight = @w WHERE id = @id');
    const pruneStmt = db.prepare('DELETE FROM knowledge_edges WHERE id = @id');
    const tx = db.transaction(() => {
      for (const u of toUpdate) updateStmt.run({ w: u.weight, id: u.id });
      for (const id of toPrune) pruneStmt.run({ id });
    });
    tx();
  }

  return {
    pass: 'hebbian',
    processed: edges.length,
    edges_created: toUpdate.length,
    edges_pruned: toPrune.length,
    duration_ms: Date.now() - t0,
    dry_run: dryRun,
  };
}

// ---------------------------------------------------------------------------
// Pass 5 — Gap scan
// ---------------------------------------------------------------------------

export function runGapScanPass(agentId: string, opts: ConsolidationOptions): ConsolidationPassResult {
  const t0 = Date.now();
  const db = getDb();
  const dryRun = opts.dry_run ?? false;
  const issues: string[] = [];

  // Orphaned memories: no edges, old (> 30 days), low confidence
  const orphanedMemories = db.prepare(`
    SELECT COUNT(*) AS cnt FROM memories m
    LEFT JOIN knowledge_edges ke ON ke.from_type = 'memory' AND ke.from_id = m.id
    WHERE m.agent_id = @agent_id AND m.retired_at IS NULL
      AND ke.id IS NULL
      AND julianday('now') - julianday(m.created_at) > 30
      AND m.confidence < 0.4
  `).get({ agent_id: agentId }) as { cnt: number };

  if (orphanedMemories.cnt > 0) {
    issues.push(`${orphanedMemories.cnt} orphaned low-confidence memories older than 30 days`);
  }

  // Entities with no observations and no edges
  const emptyEntities = db.prepare(`
    SELECT COUNT(*) AS cnt FROM entities e
    LEFT JOIN knowledge_edges ke ON ke.from_type = 'entity' AND ke.from_id = e.id
    WHERE e.agent_id = @agent_id AND e.observations IS NULL AND ke.id IS NULL
  `).get({ agent_id: agentId }) as { cnt: number };

  if (emptyEntities.cnt > 0) {
    issues.push(`${emptyEntities.cnt} entities with no observations or edges`);
  }

  // Broken edges (pointing to retired memories)
  const brokenEdges = db.prepare(`
    SELECT COUNT(*) AS cnt FROM knowledge_edges ke
    JOIN memories m ON m.id = ke.from_id
    WHERE ke.from_type = 'memory' AND m.retired_at IS NOT NULL
    UNION ALL
    SELECT COUNT(*) AS cnt FROM knowledge_edges ke
    JOIN memories m ON m.id = ke.to_id
    WHERE ke.to_type = 'memory' AND m.retired_at IS NOT NULL
  `).all() as Array<{ cnt: number }>;

  const totalBroken = brokenEdges.reduce((s, r) => s + r.cnt, 0);
  if (totalBroken > 0) {
    issues.push(`${totalBroken} knowledge edges pointing to retired memories`);
  }

  // Memories missing vector embeddings (if vec is available)
  if (isVecLoaded()) {
    try {
      const missingVec = db.prepare(`
        SELECT COUNT(*) AS cnt FROM memories m
        LEFT JOIN vec_memories v ON v.rowid = m.id
        WHERE m.agent_id = @agent_id AND m.retired_at IS NULL AND v.rowid IS NULL
      `).get({ agent_id: agentId }) as { cnt: number };

      if (missingVec.cnt > 0) {
        issues.push(`${missingVec.cnt} memories missing vector embeddings (run POST /embeddings/backfill)`);
      }
    } catch { /* vec table not ready */ }
  }

  return {
    pass: 'gap_scan',
    processed: 1,
    issues,
    duration_ms: Date.now() - t0,
    dry_run: dryRun,
  };
}

// ---------------------------------------------------------------------------
// Pass 6 — Entity tier promotion
// ---------------------------------------------------------------------------

export function runEntityTierPass(agentId: string, opts: ConsolidationOptions): ConsolidationPassResult {
  const t0 = Date.now();
  const db = getDb();
  const dryRun = opts.dry_run ?? false;

  const entities = db.prepare(`
    SELECT e.id,
      (SELECT COUNT(*) FROM knowledge_edges ke WHERE ke.from_id = e.id OR ke.to_id = e.id) AS edge_count
    FROM entities e
    WHERE e.agent_id = @agent_id
  `).all({ agent_id: agentId }) as Array<{ id: number; edge_count: number }>;

  const updates: Array<{ id: number; tier: number }> = [];
  for (const e of entities) {
    const tier = e.edge_count >= 20 ? 3 : e.edge_count >= 5 ? 2 : 1;
    updates.push({ id: e.id, tier });
  }

  if (!dryRun && updates.length) {
    const stmt = db.prepare('UPDATE entities SET tier = @tier WHERE id = @id');
    const tx = db.transaction(() => { for (const u of updates) stmt.run(u); });
    tx();
  }

  const promoted = updates.filter((u) => u.tier >= 2).length;
  return {
    pass: 'entity_tiers',
    processed: entities.length,
    promoted,
    duration_ms: Date.now() - t0,
    dry_run: dryRun,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator — full cycle
// ---------------------------------------------------------------------------

const ALL_PASSES = ['decay', 'promote', 'compress', 'hebbian', 'gap_scan', 'entity_tiers'] as const;

export async function runConsolidationCycle(
  agentId: string,
  opts: ConsolidationOptions = {}
): Promise<ConsolidationReport> {
  const db = getDb();
  const startedAt = new Date().toISOString();
  const passes = (opts.passes ?? ALL_PASSES) as string[];
  const dryRun = opts.dry_run ?? false;

  const logId = (db.prepare(`
    INSERT INTO consolidation_log (agent_id, started_at, status)
    VALUES (@agent_id, @started_at, 'running')
  `).run({ agent_id: agentId, started_at: startedAt }).lastInsertRowid) as number;

  const results: ConsolidationPassResult[] = [];

  try {
    if (passes.includes('decay')) results.push(runDecayPass(agentId, opts));
    if (passes.includes('promote')) results.push(runPromotionPass(agentId, opts));
    if (passes.includes('compress')) results.push(await runCompressionPass(agentId, opts));
    if (passes.includes('hebbian')) results.push(runHebbianPass(agentId, opts));
    if (passes.includes('gap_scan')) results.push(runGapScanPass(agentId, opts));
    if (passes.includes('entity_tiers')) results.push(runEntityTierPass(agentId, opts));
  } catch (err) {
    const completedAt = new Date().toISOString();
    const report: ConsolidationReport = {
      agent_id: agentId,
      started_at: startedAt,
      completed_at: completedAt,
      passes: results,
      total_duration_ms: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      dry_run: dryRun,
    };
    if (!dryRun) {
      db.prepare(`UPDATE consolidation_log SET completed_at = @t, status = 'failed', report = @r WHERE id = @id`)
        .run({ t: completedAt, r: JSON.stringify(report), id: logId });
    }
    throw err;
  }

  const completedAt = new Date().toISOString();
  const report: ConsolidationReport = {
    agent_id: agentId,
    started_at: startedAt,
    completed_at: completedAt,
    passes: results,
    total_duration_ms: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    dry_run: dryRun,
  };

  if (!dryRun) {
    db.prepare(`UPDATE consolidation_log SET completed_at = @t, status = 'complete', report = @r WHERE id = @id`)
      .run({ t: completedAt, r: JSON.stringify(report), id: logId });
  }

  return report;
}

export function getLastConsolidation(agentId: string) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM consolidation_log
    WHERE agent_id = @agent_id
    ORDER BY started_at DESC LIMIT 1
  `).get({ agent_id: agentId }) as { id: number; started_at: string; completed_at: string | null; status: string; report: string | null } | undefined;

  if (!row) return null;
  return {
    ...row,
    report: row.report ? JSON.parse(row.report) : null,
  };
}

export function getConsolidationHistory(agentId: string, limit = 10) {
  const db = getDb();
  return (db.prepare(`
    SELECT id, agent_id, started_at, completed_at, status
    FROM consolidation_log
    WHERE agent_id = @agent_id
    ORDER BY started_at DESC LIMIT @limit
  `).all({ agent_id: agentId, limit }) as Array<Record<string, unknown>>);
}
