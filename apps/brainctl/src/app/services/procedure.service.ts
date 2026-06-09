import { getDb } from '../db/database.js';

export interface Procedure {
  id: number;
  agent_id: string;
  goal: string;
  title: string | null;
  description: string;
  steps: string | null;
  procedure_kind: string;
  scope: string;
  category: string;
  confidence: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProcedureInput {
  goal: string;
  title?: string;
  description?: string;
  steps?: Array<{ step: number; action: string; notes?: string }>;
  procedure_kind?: string;
  scope?: string;
  category?: string;
  confidence?: number;
  agent_id?: string;
}

export interface ListProceduresInput {
  status?: string;
  scope?: string;
  limit?: number;
  agent_id?: string;
}

export interface SearchProceduresInput {
  query: string;
  limit?: number;
  scope?: string;
  status?: string;
  agent_id?: string;
}

export interface ProcedureFeedbackInput {
  procedure_id: number;
  success: boolean;
  usefulness_score?: number;
  outcome_summary?: string;
  errors_seen?: string;
  validated?: boolean;
  task_signature?: string;
  input_summary?: string;
}

export function createProcedure(input: CreateProcedureInput): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO procedures (agent_id, goal, title, description, steps, procedure_kind, scope, category, confidence)
    VALUES (@agent_id, @goal, @title, @description, @steps, @procedure_kind, @scope, @category, @confidence)
  `).run({
    agent_id: input.agent_id ?? 'default',
    goal: input.goal,
    title: input.title ?? null,
    description: input.description ?? '',
    steps: input.steps ? JSON.stringify(input.steps) : null,
    procedure_kind: input.procedure_kind ?? 'workflow',
    scope: input.scope ?? 'global',
    category: input.category ?? 'convention',
    confidence: input.confidence ?? 0.9,
  });
  return result.lastInsertRowid as number;
}

export function getProcedure(id: number, agentId = 'default'): Procedure | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM procedures WHERE id = @id AND agent_id = @agent_id'
  ).get({ id, agent_id: agentId }) as Procedure | undefined;
}

export function listProcedures(input: ListProceduresInput): Procedure[] {
  const db = getDb();
  const limit = input.limit ?? 50;
  const agentId = input.agent_id ?? 'default';

  let sql = 'SELECT * FROM procedures WHERE agent_id = @agent_id';
  const params: Record<string, unknown> = { agent_id: agentId, limit };

  if (input.status && input.status !== 'all') {
    sql += ' AND status = @status';
    params['status'] = input.status;
  }
  if (input.scope) {
    sql += ' AND scope = @scope';
    params['scope'] = input.scope;
  }

  sql += ' ORDER BY updated_at DESC LIMIT @limit';
  return db.prepare(sql).all(params) as Procedure[];
}

export function searchProcedures(input: SearchProceduresInput): Procedure[] {
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
    SELECT p.* FROM procedures p
    JOIN procedures_fts fts ON fts.rowid = p.id
    WHERE procedures_fts MATCH @query AND p.agent_id = @agent_id
  `;
  const params: Record<string, unknown> = { query: sanitized, agent_id: agentId, limit };

  if (input.status && input.status !== 'all') {
    sql += ' AND p.status = @status';
    params['status'] = input.status;
  }
  if (input.scope) {
    sql += ' AND p.scope = @scope';
    params['scope'] = input.scope;
  }

  sql += ' ORDER BY rank LIMIT @limit';

  try {
    return db.prepare(sql).all(params) as Procedure[];
  } catch {
    const fallback = `
      SELECT * FROM procedures WHERE agent_id = @agent_id AND goal LIKE @like
      ORDER BY updated_at DESC LIMIT @limit
    `;
    return db.prepare(fallback).all({ agent_id: agentId, like: `%${input.query}%`, limit }) as Procedure[];
  }
}

export function updateProcedure(id: number, input: {
  goal?: string; title?: string; description?: string;
  steps?: Array<{ step: number; action: string; notes?: string }>;
  procedure_kind?: string; scope?: string; category?: string;
  confidence?: number; status?: string; agent_id?: string;
}): boolean {
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const fields: string[] = ['updated_at = @updated_at'];
  const params: Record<string, unknown> = { id, agent_id: agentId, updated_at: new Date().toISOString() };
  if (input.goal !== undefined) { fields.push('goal = @goal'); params['goal'] = input.goal; }
  if (input.title !== undefined) { fields.push('title = @title'); params['title'] = input.title; }
  if (input.description !== undefined) { fields.push('description = @description'); params['description'] = input.description; }
  if (input.steps !== undefined) { fields.push('steps = @steps'); params['steps'] = JSON.stringify(input.steps); }
  if (input.procedure_kind !== undefined) { fields.push('procedure_kind = @procedure_kind'); params['procedure_kind'] = input.procedure_kind; }
  if (input.scope !== undefined) { fields.push('scope = @scope'); params['scope'] = input.scope; }
  if (input.category !== undefined) { fields.push('category = @category'); params['category'] = input.category; }
  if (input.confidence !== undefined) { fields.push('confidence = @confidence'); params['confidence'] = input.confidence; }
  if (input.status !== undefined) { fields.push('status = @status'); params['status'] = input.status; }
  return db.prepare(`UPDATE procedures SET ${fields.join(', ')} WHERE id = @id AND agent_id = @agent_id`)
    .run(params).changes > 0;
}

export function deleteProcedure(id: number, agentId = 'default'): boolean {
  return getDb().prepare('DELETE FROM procedures WHERE id = ? AND agent_id = ?')
    .run(id, agentId).changes > 0;
}

export function recordFeedback(input: ProcedureFeedbackInput): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO procedure_feedback
      (procedure_id, success, usefulness_score, outcome_summary, errors_seen, validated, task_signature, input_summary)
    VALUES
      (@procedure_id, @success, @usefulness_score, @outcome_summary, @errors_seen, @validated, @task_signature, @input_summary)
  `).run({
    procedure_id: input.procedure_id,
    success: input.success ? 1 : 0,
    usefulness_score: input.usefulness_score ?? null,
    outcome_summary: input.outcome_summary ?? null,
    errors_seen: input.errors_seen ?? null,
    validated: input.validated ? 1 : 0,
    task_signature: input.task_signature ?? null,
    input_summary: input.input_summary ?? null,
  });
  return result.lastInsertRowid as number;
}
