import { getDb } from '../db/database.js';
import { chat, isLlmAvailable } from './llm.service.js';
import { searchMemories } from './memory.service.js';

// ---------------------------------------------------------------------------
// Theory of Mind — model what another agent likely believes/intends
// ---------------------------------------------------------------------------

export interface TomModel {
  observer_agent: string;
  subject_agent: string;
  modeled_beliefs: string[];
  modeled_intentions: string[];
  confidence: number;
  generated_at: string;
  reasoning: string | null;
}

function ensureTomTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS tom_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observer_agent TEXT NOT NULL,
      subject_agent TEXT NOT NULL,
      modeled_beliefs TEXT NOT NULL DEFAULT '[]',
      modeled_intentions TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 0.5,
      reasoning TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tom_observer ON tom_models(observer_agent);
    CREATE INDEX IF NOT EXISTS idx_tom_subject ON tom_models(subject_agent);
  `);
}

export async function modelAgent(input: {
  observer_agent: string;
  subject_agent: string;
  topic?: string;
  model?: string;
}): Promise<TomModel> {
  ensureTomTable();
  const db = getDb();

  // Gather evidence: shared memories visible to observer, subject's events, beliefs
  const subjectMemories = await searchMemories({
    query: input.topic ?? 'goal intention belief',
    limit: 10,
    agent_id: input.subject_agent,
  });

  let modeled_beliefs: string[] = [];
  let modeled_intentions: string[] = [];
  let reasoning: string | null = null;

  if (isLlmAvailable() && subjectMemories.length) {
    const memText = subjectMemories.map((m) => `- ${m.content}`).join('\n');
    const raw = await chat([
      {
        role: 'system',
        content: 'You model another agent\'s mental state from their memory records. ' +
          'Respond with JSON: {"beliefs": ["..."], "intentions": ["..."], "reasoning": "..."}',
      },
      {
        role: 'user',
        content: `Subject agent: ${input.subject_agent}\n` +
          (input.topic ? `Topic: ${input.topic}\n` : '') +
          `Memory records:\n${memText}`,
      },
    ], { model: input.model, temperature: 0.2, max_tokens: 400 });

    try {
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
      modeled_beliefs = Array.isArray(parsed.beliefs) ? parsed.beliefs : [];
      modeled_intentions = Array.isArray(parsed.intentions) ? parsed.intentions : [];
      reasoning = parsed.reasoning ?? null;
    } catch {
      modeled_beliefs = subjectMemories.slice(0, 3).map((m) => m.content);
      reasoning = 'JSON parse failed — raw memory content used';
    }
  } else {
    modeled_beliefs = subjectMemories.slice(0, 5).map((m) => m.content);
  }

  const confidence = subjectMemories.length > 0 ? Math.min(0.9, 0.4 + subjectMemories.length * 0.05) : 0.1;

  const result = db.prepare(`
    INSERT INTO tom_models (observer_agent, subject_agent, modeled_beliefs, modeled_intentions, confidence, reasoning)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.observer_agent, input.subject_agent,
    JSON.stringify(modeled_beliefs), JSON.stringify(modeled_intentions),
    confidence, reasoning,
  );

  return {
    observer_agent: input.observer_agent,
    subject_agent: input.subject_agent,
    modeled_beliefs,
    modeled_intentions,
    confidence,
    generated_at: new Date().toISOString(),
    reasoning,
  };
}

export function getLatestTomModel(observerAgent: string, subjectAgent: string): TomModel | null {
  ensureTomTable();
  const row = getDb().prepare(`
    SELECT * FROM tom_models
    WHERE observer_agent = ? AND subject_agent = ?
    ORDER BY generated_at DESC LIMIT 1
  `).get(observerAgent, subjectAgent) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    observer_agent: row['observer_agent'] as string,
    subject_agent: row['subject_agent'] as string,
    modeled_beliefs: JSON.parse(row['modeled_beliefs'] as string) as string[],
    modeled_intentions: JSON.parse(row['modeled_intentions'] as string) as string[],
    confidence: row['confidence'] as number,
    generated_at: row['generated_at'] as string,
    reasoning: row['reasoning'] as string | null,
  };
}

export function listTomModels(observerAgent: string): TomModel[] {
  ensureTomTable();
  const rows = getDb().prepare(`
    SELECT * FROM tom_models WHERE observer_agent = ?
    ORDER BY generated_at DESC
  `).all(observerAgent) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    observer_agent: row['observer_agent'] as string,
    subject_agent: row['subject_agent'] as string,
    modeled_beliefs: JSON.parse(row['modeled_beliefs'] as string) as string[],
    modeled_intentions: JSON.parse(row['modeled_intentions'] as string) as string[],
    confidence: row['confidence'] as number,
    generated_at: row['generated_at'] as string,
    reasoning: row['reasoning'] as string | null,
  }));
}

// ---------------------------------------------------------------------------
// Budget — token/compute budget management per agent
// ---------------------------------------------------------------------------

export interface BudgetStatus {
  agent_id: string;
  token_budget: number | null;
  tokens_used: number;
  tokens_remaining: number | null;
  call_budget: number | null;
  calls_used: number;
  calls_remaining: number | null;
  reset_at: string | null;
  updated_at: string;
}

function ensureBudgetTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS agent_budgets (
      agent_id TEXT PRIMARY KEY,
      token_budget INTEGER,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      call_budget INTEGER,
      calls_used INTEGER NOT NULL DEFAULT 0,
      reset_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function setBudget(input: {
  agent_id: string; token_budget?: number; call_budget?: number; reset_at?: string;
}): BudgetStatus {
  ensureBudgetTable();
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_budgets (agent_id, token_budget, call_budget, reset_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (agent_id) DO UPDATE SET
      token_budget = COALESCE(excluded.token_budget, token_budget),
      call_budget  = COALESCE(excluded.call_budget, call_budget),
      reset_at     = COALESCE(excluded.reset_at, reset_at),
      updated_at   = datetime('now')
  `).run(
    input.agent_id,
    input.token_budget ?? null,
    input.call_budget ?? null,
    input.reset_at ?? null,
  );
  return getBudgetStatus(input.agent_id);
}

export function recordBudgetUsage(agentId: string, tokensUsed: number, calls = 1): BudgetStatus {
  ensureBudgetTable();
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_budgets (agent_id, tokens_used, calls_used)
    VALUES (?, ?, ?)
    ON CONFLICT (agent_id) DO UPDATE SET
      tokens_used = tokens_used + excluded.tokens_used,
      calls_used  = calls_used  + excluded.calls_used,
      updated_at  = datetime('now')
  `).run(agentId, tokensUsed, calls);
  return getBudgetStatus(agentId);
}

export function resetBudget(agentId: string): BudgetStatus {
  ensureBudgetTable();
  getDb().prepare(`
    UPDATE agent_budgets SET tokens_used = 0, calls_used = 0, updated_at = datetime('now')
    WHERE agent_id = ?
  `).run(agentId);
  return getBudgetStatus(agentId);
}

export function getBudgetStatus(agentId: string): BudgetStatus {
  ensureBudgetTable();
  const row = getDb().prepare('SELECT * FROM agent_budgets WHERE agent_id = ?')
    .get(agentId) as Record<string, number | string | null> | undefined;

  const tokens_used = (row?.['tokens_used'] as number) ?? 0;
  const calls_used = (row?.['calls_used'] as number) ?? 0;
  const token_budget = (row?.['token_budget'] as number | null) ?? null;
  const call_budget = (row?.['call_budget'] as number | null) ?? null;

  return {
    agent_id: agentId,
    token_budget,
    tokens_used,
    tokens_remaining: token_budget !== null ? Math.max(0, token_budget - tokens_used) : null,
    call_budget,
    calls_used,
    calls_remaining: call_budget !== null ? Math.max(0, call_budget - calls_used) : null,
    reset_at: (row?.['reset_at'] as string | null) ?? null,
    updated_at: (row?.['updated_at'] as string) ?? new Date().toISOString(),
  };
}
