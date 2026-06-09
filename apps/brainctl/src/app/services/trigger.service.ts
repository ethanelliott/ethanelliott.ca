import { getDb } from '../db/database.js';

export interface Trigger {
  id: number;
  agent_id: string;
  condition: string;
  keywords: string;
  action: string;
  priority: string;
  expires: string | null;
  created_at: string;
  fired_at: string | null;
  active: number;
}

export interface CreateTriggerInput {
  condition: string;
  keywords: string;
  action: string;
  priority?: string;
  expires?: string;
  agent_id?: string;
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function createTrigger(input: CreateTriggerInput): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO triggers (agent_id, condition, keywords, action, priority, expires)
    VALUES (@agent_id, @condition, @keywords, @action, @priority, @expires)
  `).run({
    agent_id: input.agent_id ?? 'default',
    condition: input.condition,
    keywords: input.keywords,
    action: input.action,
    priority: input.priority ?? 'medium',
    expires: input.expires ?? null,
  });
  return result.lastInsertRowid as number;
}

export function checkTriggers(query: string, agentId = 'default'): Trigger[] {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE triggers SET active = 0
    WHERE agent_id = @agent_id AND active = 1 AND expires IS NOT NULL AND expires < @now
  `).run({ agent_id: agentId, now });

  const active = db.prepare(`
    SELECT * FROM triggers WHERE agent_id = @agent_id AND active = 1
  `).all({ agent_id: agentId }) as Trigger[];

  const queryLower = query.toLowerCase();
  const matched = active.filter((t) => {
    const keywords = t.keywords.split(',').map((k) => k.trim().toLowerCase());
    return keywords.some((k) => k && queryLower.includes(k));
  });

  matched.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));

  return matched.map((t) => ({ ...t, matched_keywords: t.keywords }));
}

export function getActiveTriggers(agentId = 'default'): Trigger[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM triggers WHERE agent_id = @agent_id AND active = 1
    ORDER BY created_at DESC
  `).all({ agent_id: agentId }) as Trigger[];
}

export function deleteTrigger(id: number, agentId = 'default'): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE triggers SET active = 0 WHERE id = @id AND agent_id = @agent_id
  `).run({ id, agent_id: agentId });
  return result.changes > 0;
}
