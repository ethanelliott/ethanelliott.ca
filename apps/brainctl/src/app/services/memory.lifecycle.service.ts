import { getDb, isVecLoaded } from '../db/database.js';
import { embed, serializeVec } from './embeddings.service.js';
import { chat, isLlmAvailable } from './llm.service.js';
import { searchMemories, addMemory } from './memory.service.js';
import type { Memory } from './memory.service.js';

// ---------------------------------------------------------------------------
// zoom_in — find more granular/specific memories around a seed memory
// ---------------------------------------------------------------------------

export async function zoomIn(input: {
  id: number; agent_id?: string; limit?: number;
}): Promise<Memory[]> {
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const limit = input.limit ?? 10;

  const seed = db.prepare('SELECT * FROM memories WHERE id = ? AND agent_id = ?')
    .get(input.id, agentId) as Memory | undefined;
  if (!seed) return [];

  if (isVecLoaded()) {
    const vec = await embed(seed.content);
    if (vec) {
      try {
        return db.prepare(`
          SELECT m.* FROM vec_memories v
          JOIN memories m ON m.id = v.rowid
          WHERE v.embedding MATCH ? AND k = ?
            AND m.agent_id = ? AND m.retired_at IS NULL AND m.id != ?
            AND m.memory_type = 'episodic'
          ORDER BY v.distance
        `).all(serializeVec(vec), limit, agentId, input.id) as Memory[];
      } catch { /* fall through to FTS */ }
    }
  }

  // FTS fallback — use most distinctive words from the seed
  const words = seed.content
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 6)
    .join(' OR ');

  if (!words) return [];
  return db.prepare(`
    SELECT m.* FROM memories m
    JOIN memories_fts fts ON fts.rowid = m.id
    WHERE memories_fts MATCH ?
      AND m.agent_id = ? AND m.retired_at IS NULL AND m.id != ?
      AND m.memory_type = 'episodic'
    ORDER BY rank LIMIT ?
  `).all(words, agentId, input.id, limit) as Memory[];
}

// ---------------------------------------------------------------------------
// zoom_out — abstractly summarize a cluster of memories
// ---------------------------------------------------------------------------

export async function zoomOut(input: {
  ids?: number[]; query?: string; agent_id?: string;
  model?: string; store?: boolean;
}): Promise<{ summary: string; source_ids: number[]; stored_id?: number }> {
  const agentId = input.agent_id ?? 'default';
  let memories: Memory[] = [];

  if (input.ids?.length) {
    const db = getDb();
    memories = db.prepare(
      `SELECT * FROM memories WHERE id IN (${input.ids.map(() => '?').join(',')}) AND agent_id = ? AND retired_at IS NULL`,
    ).all(...input.ids, agentId) as Memory[];
  } else if (input.query) {
    memories = await searchMemories({ query: input.query, limit: 10, agent_id: agentId });
  }

  if (!memories.length) return { summary: 'No memories found.', source_ids: [] };

  const sourceIds = memories.map((m) => m.id);
  const context = memories.map((m, i) => `${i + 1}. ${m.content}`).join('\n');

  if (!isLlmAvailable()) {
    return { summary: `[${memories.length} memories — LLM unavailable]`, source_ids: sourceIds };
  }

  const summary = await chat([
    { role: 'system', content: 'Synthesize the following memories into a single abstract summary sentence. Be concise.' },
    { role: 'user', content: context },
  ], { model: input.model, temperature: 0.2, max_tokens: 200 });

  let storedId: number | undefined;
  if (input.store) {
    storedId = await addMemory({
      content: summary, category: 'abstraction', memory_type: 'semantic',
      confidence: 0.75, agent_id: agentId,
    });
  }

  return { summary, source_ids: sourceIds, stored_id: storedId };
}

// ---------------------------------------------------------------------------
// abstract_summarize — multi-level summary (broad → specific)
// ---------------------------------------------------------------------------

export async function abstractSummarize(input: {
  query: string; levels?: number; agent_id?: string; model?: string;
}): Promise<Array<{ level: number; label: string; summary: string; memory_count: number }>> {
  const agentId = input.agent_id ?? 'default';
  const levels = Math.min(input.levels ?? 3, 5);
  const results: Array<{ level: number; label: string; summary: string; memory_count: number }> = [];

  for (let lvl = 1; lvl <= levels; lvl++) {
    const limit = 5 * lvl;
    const memories = await searchMemories({ query: input.query, limit, agent_id: agentId });

    if (!memories.length) break;

    let summary: string;
    if (isLlmAvailable()) {
      const context = memories.map((m) => m.content).join('\n');
      const granularity = lvl === 1 ? 'high-level (1 sentence)' : lvl <= 3 ? 'medium detail (2-3 sentences)' : 'detailed (4-5 sentences)';
      summary = await chat([
        { role: 'system', content: `Summarize at ${granularity} granularity. No preamble.` },
        { role: 'user', content: context },
      ], { model: input.model, temperature: 0.2, max_tokens: lvl * 100 });
    } else {
      summary = memories.slice(0, lvl).map((m) => m.content).join(' | ');
    }

    results.push({
      level: lvl,
      label: ['abstract', 'overview', 'summary', 'detailed', 'granular'][lvl - 1],
      summary,
      memory_count: memories.length,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// retirement_analysis — score low-confidence memories as retirement candidates
// ---------------------------------------------------------------------------

export async function retirementAnalysis(input: {
  agent_id?: string; limit?: number; model?: string; explain?: boolean;
}): Promise<Array<{ memory: Memory; retire_score: number; reason: string }>> {
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const limit = input.limit ?? 20;

  const candidates = db.prepare(`
    SELECT * FROM memories
    WHERE agent_id = ? AND retired_at IS NULL AND quarantined_at IS NULL
      AND (confidence < 0.3 OR (recalled_count = 0 AND julianday('now') - julianday(created_at) > 30))
    ORDER BY confidence ASC, recalled_count ASC, created_at ASC
    LIMIT ?
  `).all(agentId, limit) as Memory[];

  if (!candidates.length) return [];

  const results = await Promise.all(candidates.map(async (m) => {
    const ageDays = (Date.now() - new Date(m.created_at).getTime()) / 86400000;
    const retire_score = Math.min(1, (1 - m.confidence) * 0.6 + (m.recalled_count === 0 ? 0.3 : 0) + Math.min(0.1, ageDays / 365));

    let reason = `confidence=${m.confidence.toFixed(2)}, recalled=${m.recalled_count}, age=${Math.round(ageDays)}d`;

    if (input.explain && isLlmAvailable()) {
      try {
        reason = await chat([
          { role: 'system', content: 'In one sentence, explain why this memory should be retired (low usefulness, staleness, etc).' },
          { role: 'user', content: m.content },
        ], { model: input.model, temperature: 0, max_tokens: 80 });
      } catch { /* keep default reason */ }
    }

    return { memory: m, retire_score, reason };
  }));

  return results.sort((a, b) => b.retire_score - a.retire_score);
}

// ---------------------------------------------------------------------------
// resolve_conflict — detect contradictions between memories and resolve
// ---------------------------------------------------------------------------

export async function resolveConflict(input: {
  id_a: number; id_b: number; agent_id?: string; model?: string; store?: boolean;
}): Promise<{ conflict_detected: boolean; resolution: string; stored_id?: number }> {
  const db = getDb();
  const agentId = input.agent_id ?? 'default';

  const [memA, memB] = [
    db.prepare('SELECT * FROM memories WHERE id = ? AND agent_id = ?').get(input.id_a, agentId) as Memory | undefined,
    db.prepare('SELECT * FROM memories WHERE id = ? AND agent_id = ?').get(input.id_b, agentId) as Memory | undefined,
  ];

  if (!memA || !memB) {
    return { conflict_detected: false, resolution: 'One or both memories not found.' };
  }

  if (!isLlmAvailable()) {
    return { conflict_detected: false, resolution: 'LLM unavailable — cannot evaluate conflict.' };
  }

  const raw = await chat([
    { role: 'system', content: 'Analyze if these two memories contradict each other. Respond with JSON: {"conflict": true/false, "resolution": "..."}' },
    { role: 'user', content: `Memory A: ${memA.content}\nMemory B: ${memB.content}` },
  ], { model: input.model, temperature: 0, max_tokens: 300 });

  let conflict_detected = false;
  let resolution = raw;

  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
    conflict_detected = Boolean(parsed.conflict);
    resolution = parsed.resolution ?? raw;
  } catch { /* use raw */ }

  let storedId: number | undefined;
  if (conflict_detected && input.store) {
    storedId = await addMemory({
      content: `[Conflict resolution] Memory #${input.id_a} vs #${input.id_b}: ${resolution}`,
      category: 'conflict_resolution', memory_type: 'semantic',
      confidence: 0.8, agent_id: agentId,
    });
  }

  return { conflict_detected, resolution, stored_id: storedId };
}

// ---------------------------------------------------------------------------
// quarantine — isolate a memory pending review
// ---------------------------------------------------------------------------

export function quarantineMemory(id: number, agentId = 'default'): boolean {
  return getDb().prepare(`
    UPDATE memories SET quarantined_at = datetime('now')
    WHERE id = ? AND agent_id = ? AND quarantined_at IS NULL AND retired_at IS NULL
  `).run(id, agentId).changes > 0;
}

export function unquarantineMemory(id: number, agentId = 'default'): boolean {
  return getDb().prepare(
    'UPDATE memories SET quarantined_at = NULL WHERE id = ? AND agent_id = ?',
  ).run(id, agentId).changes > 0;
}

export function listQuarantined(agentId: string, limit = 50): Memory[] {
  return getDb().prepare(`
    SELECT * FROM memories
    WHERE agent_id = ? AND quarantined_at IS NOT NULL AND retired_at IS NULL
    ORDER BY quarantined_at DESC LIMIT ?
  `).all(agentId, limit) as Memory[];
}

// ---------------------------------------------------------------------------
// search_patterns — detect recurring themes across memories (statistical)
// ---------------------------------------------------------------------------

export async function searchPatterns(input: {
  agent_id?: string; limit?: number; min_count?: number; model?: string;
}): Promise<Array<{ pattern: string; count: number; example_ids: number[] }>> {
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const limit = input.limit ?? 15;
  const minCount = input.min_count ?? 3;

  // Extract top N-gram tags from the tag field
  const rows = db.prepare(`
    SELECT tags, id FROM memories
    WHERE agent_id = ? AND retired_at IS NULL AND tags IS NOT NULL AND tags != ''
    ORDER BY recalled_count DESC
  `).all(agentId) as Array<{ tags: string; id: number }>;

  const tagCount = new Map<string, number[]>();
  for (const row of rows) {
    for (const tag of row.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)) {
      if (!tagCount.has(tag)) tagCount.set(tag, []);
      tagCount.get(tag)!.push(row.id);
    }
  }

  const patterns = Array.from(tagCount.entries())
    .filter(([, ids]) => ids.length >= minCount)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, limit)
    .map(([tag, ids]) => ({ pattern: tag, count: ids.length, example_ids: ids.slice(0, 5) }));

  // If LLM available and few tag patterns, augment with LLM category detection
  if (patterns.length < 5 && isLlmAvailable()) {
    const sample = db.prepare(`
      SELECT content FROM memories
      WHERE agent_id = ? AND retired_at IS NULL
      ORDER BY recalled_count DESC, RANDOM() LIMIT 50
    `).all(agentId) as Array<{ content: string }>;

    if (sample.length >= 10) {
      try {
        const raw = await chat([
          { role: 'system', content: 'Identify 5 recurring themes in these memory entries. Respond with JSON array: [{"pattern":"...","description":"..."}]' },
          { role: 'user', content: sample.map((s) => s.content).join('\n---\n') },
        ], { model: input.model, temperature: 0.3, max_tokens: 300 });

        const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)![0]) as Array<{ pattern: string }>;
        for (const p of parsed) {
          if (!patterns.find((existing) => existing.pattern === p.pattern)) {
            patterns.push({ pattern: p.pattern, count: 0, example_ids: [] });
          }
        }
      } catch { /* skip LLM augmentation */ }
    }
  }

  return patterns;
}
