import { getDb } from '../db/database.js';
import { getRecentEvents, logEvent } from './event.service.js';
import { searchMemories } from './memory.service.js';
import { getActiveTriggers } from './trigger.service.js';
import { listProcedures } from './procedure.service.js';

export interface Handoff {
  id: number;
  agent_id: string;
  goal: string;
  current_state: string;
  open_loops: string;
  next_step: string;
  project: string | null;
  title: string | null;
  created_at: string;
  consumed_at: string | null;
}

export interface CreateHandoffInput {
  goal: string;
  current_state: string;
  open_loops: string;
  next_step: string;
  project?: string;
  title?: string;
  agent_id?: string;
}

export interface WrapUpInput {
  summary: string;
  goal?: string;
  open_loops?: string;
  next_step?: string;
  project?: string;
  agent_id?: string;
}

export interface OrientInput {
  project?: string;
  query?: string;
  agent_id?: string;
}

export function createHandoff(input: CreateHandoffInput): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO handoffs (agent_id, goal, current_state, open_loops, next_step, project, title)
    VALUES (@agent_id, @goal, @current_state, @open_loops, @next_step, @project, @title)
  `).run({
    agent_id: input.agent_id ?? 'default',
    goal: input.goal,
    current_state: input.current_state,
    open_loops: input.open_loops,
    next_step: input.next_step,
    project: input.project ?? null,
    title: input.title ?? null,
  });
  return result.lastInsertRowid as number;
}

export function getLatestHandoff(agentId = 'default', project?: string): Handoff | undefined {
  const db = getDb();
  let sql = `
    SELECT * FROM handoffs
    WHERE agent_id = @agent_id AND consumed_at IS NULL
  `;
  const params: Record<string, unknown> = { agent_id: agentId };

  if (project) {
    sql += ' AND project = @project';
    params['project'] = project;
  }

  sql += ' ORDER BY created_at DESC LIMIT 1';
  return db.prepare(sql).get(params) as Handoff | undefined;
}

export function consumeHandoff(id: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE handoffs SET consumed_at = datetime('now') WHERE id = @id
  `).run({ id });
}

export function orient(input: OrientInput) {
  const agentId = input.agent_id ?? 'default';
  const db = getDb();

  const handoff = getLatestHandoff(agentId, input.project);
  if (handoff) consumeHandoff(handoff.id);

  const recentEvents = getRecentEvents(agentId, 10);
  const triggers = getActiveTriggers(agentId);
  const memories = input.query ? searchMemories({ query: input.query, agent_id: agentId }) : [];
  const procedures = listProcedures({ agent_id: agentId, status: 'active' });

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM memories WHERE agent_id = @a AND retired_at IS NULL) AS memories,
      (SELECT COUNT(*) FROM events WHERE agent_id = @a) AS events,
      (SELECT COUNT(*) FROM entities WHERE agent_id = @a) AS entities,
      (SELECT COUNT(*) FROM decisions WHERE agent_id = @a) AS decisions,
      (SELECT COUNT(*) FROM procedures WHERE agent_id = @a AND status = 'active') AS procedures
  `).get({ a: agentId });

  return {
    agent_id: agentId,
    handoff: handoff ?? null,
    recent_events: recentEvents,
    triggers,
    memories,
    procedures,
    stats,
  };
}

export function wrapUp(input: WrapUpInput) {
  const agentId = input.agent_id ?? 'default';

  const eventId = logEvent({
    summary: input.summary,
    event_type: 'session_end',
    project: input.project,
    importance: 0.8,
    agent_id: agentId,
  });

  const handoffId = createHandoff({
    goal: input.goal ?? 'Continue from previous session',
    current_state: input.summary,
    open_loops: input.open_loops ?? '',
    next_step: input.next_step ?? '',
    project: input.project,
    agent_id: agentId,
  });

  return { event_id: eventId, handoff_id: handoffId };
}
