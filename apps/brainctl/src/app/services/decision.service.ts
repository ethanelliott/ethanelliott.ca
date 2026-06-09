import { getDb } from '../db/database.js';

export interface Decision {
  id: number;
  agent_id: string;
  title: string;
  rationale: string;
  project: string | null;
  created_at: string;
}

export interface CreateDecisionInput {
  title: string;
  rationale: string;
  project?: string;
  agent_id?: string;
}

export function createDecision(input: CreateDecisionInput): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO decisions (agent_id, title, rationale, project)
    VALUES (@agent_id, @title, @rationale, @project)
  `).run({
    agent_id: input.agent_id ?? 'default',
    title: input.title,
    rationale: input.rationale,
    project: input.project ?? null,
  });
  return result.lastInsertRowid as number;
}

export function listDecisions(agentId = 'default', project?: string, limit = 20): Decision[] {
  const db = getDb();
  let sql = 'SELECT * FROM decisions WHERE agent_id = @agent_id';
  const params: Record<string, unknown> = { agent_id: agentId, limit };

  if (project) {
    sql += ' AND project = @project';
    params['project'] = project;
  }

  sql += ' ORDER BY created_at DESC LIMIT @limit';
  return db.prepare(sql).all(params) as Decision[];
}
