import { getDb } from '../db/database.js';
import { chat, isLlmAvailable } from './llm.service.js';
import { searchMemories } from './memory.service.js';
import { addMemory } from './memory.service.js';

// ---------------------------------------------------------------------------
// belief — maintain a set of graded beliefs with confidence tracking
// ---------------------------------------------------------------------------

export interface Belief {
  id: number;
  agent_id: string;
  claim: string;
  confidence: number;
  evidence_for: string | null;
  evidence_against: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export function ensureBeliefTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS beliefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      claim TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      evidence_for TEXT,
      evidence_against TEXT,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_beliefs_claim_agent ON beliefs(claim, agent_id);
    CREATE INDEX IF NOT EXISTS idx_beliefs_agent ON beliefs(agent_id);
  `);
}

export function upsertBelief(input: {
  claim: string; confidence?: number; evidence_for?: string;
  evidence_against?: string; source?: string; agent_id?: string;
}): number {
  ensureBeliefTable();
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const result = db.prepare(`
    INSERT INTO beliefs (agent_id, claim, confidence, evidence_for, evidence_against, source)
    VALUES (@a, @claim, @conf, @ef, @ea, @src)
    ON CONFLICT (claim, agent_id) DO UPDATE SET
      confidence = @conf, evidence_for = @ef, evidence_against = @ea,
      source = @src, updated_at = datetime('now')
  `).run({ a: agentId, claim: input.claim, conf: input.confidence ?? 0.5,
           ef: input.evidence_for ?? null, ea: input.evidence_against ?? null,
           src: input.source ?? null });
  return result.lastInsertRowid as number;
}

export function listBeliefs(agentId: string, minConf?: number): Belief[] {
  ensureBeliefTable();
  const db = getDb();
  let sql = 'SELECT * FROM beliefs WHERE agent_id = @a';
  const params: Record<string, unknown> = { a: agentId };
  if (minConf !== undefined) { sql += ' AND confidence >= @min'; params['min'] = minConf; }
  sql += ' ORDER BY confidence DESC';
  return db.prepare(sql).all(params) as Belief[];
}

// ---------------------------------------------------------------------------
// trust — track trust scores for named sources/agents
// ---------------------------------------------------------------------------

export interface TrustRecord {
  id: number; agent_id: string; target: string; score: number;
  interactions: number; positive: number; negative: number;
  created_at: string; updated_at: string;
}

export function ensureTrustTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      target TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0.5,
      interactions INTEGER NOT NULL DEFAULT 0,
      positive INTEGER NOT NULL DEFAULT 0,
      negative INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trust_target_agent ON trust_records(target, agent_id);
  `);
}

export function recordInteraction(input: {
  target: string; outcome: 'positive' | 'negative' | 'neutral';
  agent_id?: string;
}): TrustRecord {
  ensureTrustTable();
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const delta = input.outcome === 'positive' ? 0.05 : input.outcome === 'negative' ? -0.08 : 0;
  const posInc = input.outcome === 'positive' ? 1 : 0;
  const negInc = input.outcome === 'negative' ? 1 : 0;

  db.prepare(`
    INSERT INTO trust_records (agent_id, target, score, interactions, positive, negative)
    VALUES (@a, @t, 0.5 + @d, 1, @p, @n)
    ON CONFLICT (target, agent_id) DO UPDATE SET
      score = max(0, min(1, score + @d)),
      interactions = interactions + 1,
      positive = positive + @p,
      negative = negative + @n,
      updated_at = datetime('now')
  `).run({ a: agentId, t: input.target, d: delta, p: posInc, n: negInc });

  return db.prepare('SELECT * FROM trust_records WHERE target = ? AND agent_id = ?')
    .get(input.target, agentId) as TrustRecord;
}

export function getTrust(target: string, agentId: string): TrustRecord | undefined {
  ensureTrustTable();
  return getDb().prepare('SELECT * FROM trust_records WHERE target = ? AND agent_id = ?')
    .get(target, agentId) as TrustRecord | undefined;
}

export function listTrust(agentId: string): TrustRecord[] {
  ensureTrustTable();
  return getDb().prepare('SELECT * FROM trust_records WHERE agent_id = ? ORDER BY score DESC')
    .all(agentId) as TrustRecord[];
}

// ---------------------------------------------------------------------------
// reflexion — log reflections on past actions and extract lessons
// ---------------------------------------------------------------------------

export interface Reflection {
  id: number; agent_id: string; action: string; outcome: string;
  lesson: string | null; confidence_delta: number;
  created_at: string;
}

export function ensureReflexionTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      lesson TEXT,
      confidence_delta REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reflections_agent ON reflections(agent_id);
  `);
}

export async function reflect(input: {
  action: string; outcome: string; agent_id?: string;
  model?: string; generate_lesson?: boolean;
}): Promise<Reflection> {
  ensureReflexionTable();
  const db = getDb();
  const agentId = input.agent_id ?? 'default';

  let lesson: string | null = null;
  const confidenceDelta = input.outcome.toLowerCase().includes('fail') ||
    input.outcome.toLowerCase().includes('error') ? -0.05 : 0.03;

  if (input.generate_lesson && isLlmAvailable()) {
    const relatedMemories = await searchMemories({ query: `${input.action} ${input.outcome}`, limit: 4, agent_id: agentId });
    const ctx = relatedMemories.map((m) => m.content).join('\n');
    try {
      lesson = await chat([
        { role: 'system', content: 'Extract a single concise lesson (one sentence) from this action and its outcome. Be specific and actionable.' },
        { role: 'user', content: `Action: ${input.action}\nOutcome: ${input.outcome}${ctx ? `\nContext:\n${ctx}` : ''}` },
      ], { model: input.model, temperature: 0.2, max_tokens: 128 });
    } catch { /* lesson stays null */ }
  }

  if (lesson) {
    await addMemory({ content: `Lesson: ${lesson}`, category: 'reflexion', memory_type: 'semantic', confidence: 0.8, agent_id: agentId });
  }

  const result = db.prepare(`
    INSERT INTO reflections (agent_id, action, outcome, lesson, confidence_delta)
    VALUES (?, ?, ?, ?, ?)
  `).run(agentId, input.action, input.outcome, lesson, confidenceDelta);

  return db.prepare('SELECT * FROM reflections WHERE id = ?').get(result.lastInsertRowid) as Reflection;
}

export function listReflections(agentId: string, limit = 20): Reflection[] {
  ensureReflexionTable();
  return getDb().prepare('SELECT * FROM reflections WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(agentId, limit) as Reflection[];
}

// ---------------------------------------------------------------------------
// workspace — scoped scratchpad for in-progress work
// ---------------------------------------------------------------------------

export function ensureWorkspaceTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      workspace_type TEXT NOT NULL DEFAULT 'note',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_agent ON workspace(agent_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_name ON workspace(agent_id, name);
  `);
}

export function upsertWorkspace(input: {
  name: string; content: string; workspace_type?: string; agent_id?: string;
}): number {
  ensureWorkspaceTable();
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const result = db.prepare(`
    INSERT INTO workspace (agent_id, name, content, workspace_type)
    VALUES (@a, @n, @c, @t)
    ON CONFLICT DO NOTHING
  `).run({ a: agentId, n: input.name, c: input.content, t: input.workspace_type ?? 'note' });

  if (result.changes === 0) {
    db.prepare(`UPDATE workspace SET content = ?, workspace_type = ?, updated_at = datetime('now')
                WHERE agent_id = ? AND name = ?`)
      .run(input.content, input.workspace_type ?? 'note', agentId, input.name);
    const row = db.prepare('SELECT id FROM workspace WHERE agent_id = ? AND name = ?').get(agentId, input.name) as { id: number };
    return row.id;
  }
  return result.lastInsertRowid as number;
}

export function getWorkspace(name: string, agentId: string) {
  ensureWorkspaceTable();
  return getDb().prepare('SELECT * FROM workspace WHERE name = ? AND agent_id = ?').get(name, agentId);
}

export function listWorkspace(agentId: string, status?: string) {
  ensureWorkspaceTable();
  const db = getDb();
  let sql = 'SELECT * FROM workspace WHERE agent_id = ?';
  const params: unknown[] = [agentId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY updated_at DESC';
  return db.prepare(sql).all(...params);
}

// ---------------------------------------------------------------------------
// task — shared task queue with status tracking
// ---------------------------------------------------------------------------

export function ensureTaskTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      assignee TEXT,
      due_at TEXT,
      completed_at TEXT,
      result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  `);
}

export function createTask(input: {
  title: string; description?: string; priority?: string;
  assignee?: string; due_at?: string; agent_id?: string;
}): number {
  ensureTaskTable();
  const result = getDb().prepare(`
    INSERT INTO tasks (agent_id, title, description, priority, assignee, due_at)
    VALUES (@a, @title, @desc, @prio, @assignee, @due)
  `).run({ a: input.agent_id ?? 'default', title: input.title, desc: input.description ?? null,
           prio: input.priority ?? 'medium', assignee: input.assignee ?? null, due: input.due_at ?? null });
  return result.lastInsertRowid as number;
}

export function updateTaskStatus(id: number, status: string, result?: string, agentId = 'default'): boolean {
  ensureTaskTable();
  const db = getDb();
  const completedAt = ['done', 'completed', 'cancelled'].includes(status) ? 'datetime(\'now\')' : 'NULL';
  const changes = db.prepare(`
    UPDATE tasks SET status = @s, result = @r,
      completed_at = ${completedAt}, updated_at = datetime('now')
    WHERE id = @id AND agent_id = @a
  `).run({ s: status, r: result ?? null, id, a: agentId }).changes;
  return changes > 0;
}

export function listTasks(agentId: string, status?: string, assignee?: string) {
  ensureTaskTable();
  const db = getDb();
  let sql = 'SELECT * FROM tasks WHERE agent_id = ?';
  const params: unknown[] = [agentId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (assignee) { sql += ' AND assignee = ?'; params.push(assignee); }
  sql += ' ORDER BY priority DESC, created_at DESC';
  return db.prepare(sql).all(...params);
}

// ---------------------------------------------------------------------------
// policy — store and evaluate named rules/constraints
// ---------------------------------------------------------------------------

export interface Policy {
  id: number; agent_id: string; name: string; rule: string;
  scope: string; active: number; created_at: string;
}

export function ensurePolicyTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      rule TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_policies_name_agent ON policies(name, agent_id);
    CREATE INDEX IF NOT EXISTS idx_policies_agent ON policies(agent_id);
  `);
}

export function upsertPolicy(input: { name: string; rule: string; scope?: string; agent_id?: string }): number {
  ensurePolicyTable();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO policies (agent_id, name, rule, scope)
    VALUES (@a, @n, @r, @s)
    ON CONFLICT (name, agent_id) DO UPDATE SET rule = @r, scope = @s
  `).run({ a: input.agent_id ?? 'default', n: input.name, r: input.rule, s: input.scope ?? 'global' });
  return result.lastInsertRowid as number;
}

export async function evaluatePolicy(input: {
  name: string; context: string; agent_id?: string; model?: string;
}): Promise<{ policy: Policy | undefined; allowed: boolean; reasoning: string }> {
  ensurePolicyTable();
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const policy = db.prepare('SELECT * FROM policies WHERE name = ? AND agent_id = ? AND active = 1')
    .get(input.name, agentId) as Policy | undefined;

  if (!policy) return { policy: undefined, allowed: true, reasoning: 'Policy not found — defaulting to allow' };

  if (!isLlmAvailable()) {
    return { policy, allowed: true, reasoning: 'LLM unavailable — policy not evaluated, defaulting to allow' };
  }

  const raw = await chat([
    { role: 'system', content: 'You are a policy evaluator. Respond with exactly: {"allowed": true/false, "reasoning": "..."}' },
    { role: 'user', content: `Policy rule: ${policy.rule}\n\nContext to evaluate: ${input.context}` },
  ], { model: input.model, temperature: 0, max_tokens: 256 });

  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
    return { policy, allowed: Boolean(parsed.allowed), reasoning: parsed.reasoning ?? raw };
  } catch {
    return { policy, allowed: true, reasoning: raw };
  }
}

export function listPolicies(agentId: string, activeOnly = true): Policy[] {
  ensurePolicyTable();
  const db = getDb();
  let sql = 'SELECT * FROM policies WHERE agent_id = ?';
  const params: unknown[] = [agentId];
  if (activeOnly) { sql += ' AND active = 1'; }
  sql += ' ORDER BY name';
  return db.prepare(sql).all(...params) as Policy[];
}
