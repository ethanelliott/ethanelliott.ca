import { getDb, isVecLoaded } from '../db/database.js';
import { embed, serializeVec } from './embeddings.service.js';

export interface Entity {
  id: number;
  agent_id: string;
  name: string;
  entity_type: string;
  properties: string | null;
  observations: string | null;
  compiled_truth: string | null;
  tier: number;
  created_at: string;
  updated_at: string;
}

export interface CreateEntityInput {
  name: string;
  entity_type?: string;
  properties?: Record<string, unknown>;
  observations?: string[];
  agent_id?: string;
}

export interface SearchEntitiesInput {
  query: string;
  limit?: number;
  entity_type?: string;
  agent_id?: string;
}

export async function createOrGetEntity(input: CreateEntityInput): Promise<number> {
  const db = getDb();
  const agentId = input.agent_id ?? 'default';

  const existing = db.prepare(
    'SELECT id FROM entities WHERE name = @name AND agent_id = @agent_id'
  ).get({ name: input.name, agent_id: agentId }) as { id: number } | undefined;

  if (existing) {
    if (input.observations?.length) {
      const current = db.prepare(
        'SELECT observations FROM entities WHERE id = @id'
      ).get({ id: existing.id }) as { observations: string | null };

      const obs: string[] = current.observations ? JSON.parse(current.observations) : [];
      obs.push(...input.observations);

      db.prepare(`
        UPDATE entities SET observations = @observations, updated_at = datetime('now')
        WHERE id = @id
      `).run({ observations: JSON.stringify(obs), id: existing.id });
    }
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO entities (agent_id, name, entity_type, properties, observations)
    VALUES (@agent_id, @name, @entity_type, @properties, @observations)
  `).run({
    agent_id: agentId,
    name: input.name,
    entity_type: input.entity_type ?? 'concept',
    properties: input.properties ? JSON.stringify(input.properties) : null,
    observations: input.observations?.length ? JSON.stringify(input.observations) : null,
  });

  const id = result.lastInsertRowid as number;

  if (isVecLoaded()) {
    const text = [input.name, input.entity_type ?? '', ...(input.observations ?? [])].join(' ');
    const vec = await embed(text);
    if (vec) {
      db.prepare('INSERT OR REPLACE INTO vec_entities(rowid, embedding) VALUES (?, ?)')
        .run(id, serializeVec(vec));
    }
  }

  return id;
}

export function getEntity(name: string, agentId = 'default'): Entity | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM entities WHERE name = @name AND agent_id = @agent_id'
  ).get({ name, agent_id: agentId }) as Entity | undefined;
}

export function searchEntities(input: SearchEntitiesInput): Entity[] {
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
    SELECT e.* FROM entities e
    JOIN entities_fts fts ON fts.rowid = e.id
    WHERE entities_fts MATCH @query AND e.agent_id = @agent_id
  `;
  const params: Record<string, unknown> = { query: sanitized, agent_id: agentId, limit };

  if (input.entity_type) {
    sql += ' AND e.entity_type = @entity_type';
    params['entity_type'] = input.entity_type;
  }

  sql += ' ORDER BY rank LIMIT @limit';

  try {
    return db.prepare(sql).all(params) as Entity[];
  } catch {
    const fallback = `
      SELECT * FROM entities
      WHERE agent_id = @agent_id AND name LIKE @like
      ORDER BY updated_at DESC LIMIT @limit
    `;
    return db.prepare(fallback).all({ agent_id: agentId, like: `%${input.query}%`, limit }) as Entity[];
  }
}

export async function searchEntitiesVec(input: SearchEntitiesInput): Promise<Entity[]> {
  if (!isVecLoaded()) return [];
  const db = getDb();
  const vec = await embed(input.query);
  if (!vec) return [];
  const agentId = input.agent_id ?? 'default';
  const limit = input.limit ?? 10;
  try {
    return db.prepare(`
      SELECT e.* FROM vec_entities v
      JOIN entities e ON e.id = v.rowid
      WHERE v.embedding MATCH ? AND k = ? AND e.agent_id = ?
      ${input.entity_type ? 'AND e.entity_type = ?' : ''}
      ORDER BY v.distance
    `).all(
      ...(input.entity_type
        ? [serializeVec(vec), limit, agentId, input.entity_type]
        : [serializeVec(vec), limit, agentId])
    ) as Entity[];
  } catch {
    return [];
  }
}

export async function updateEntity(name: string, input: {
  entity_type?: string; properties?: Record<string, unknown>;
  observations?: string[]; compiled_truth?: string; agent_id?: string;
}): Promise<boolean> {
  const db = getDb();
  const agentId = input.agent_id ?? 'default';
  const existing = db.prepare(
    'SELECT id, observations FROM entities WHERE name = @name AND agent_id = @agent_id',
  ).get({ name, agent_id: agentId }) as { id: number; observations: string | null } | undefined;
  if (!existing) return false;

  const fields: string[] = [];
  const params: Record<string, unknown> = { name, agent_id: agentId };

  if (input.entity_type !== undefined) { fields.push('entity_type = @entity_type'); params['entity_type'] = input.entity_type; }
  if (input.properties !== undefined) { fields.push('properties = @properties'); params['properties'] = JSON.stringify(input.properties); }
  if (input.compiled_truth !== undefined) { fields.push('compiled_truth = @compiled_truth'); params['compiled_truth'] = input.compiled_truth; }
  if (input.observations?.length) {
    const obs: string[] = existing.observations ? JSON.parse(existing.observations) : [];
    obs.push(...input.observations);
    fields.push('observations = @observations');
    params['observations'] = JSON.stringify(obs);
  }

  if (!fields.length) return true;
  fields.push("updated_at = datetime('now')");

  const changed = db.prepare(
    `UPDATE entities SET ${fields.join(', ')} WHERE name = @name AND agent_id = @agent_id`,
  ).run(params).changes > 0;

  // Re-embed if text changed
  if (changed && isVecLoaded() && (input.entity_type || input.observations?.length || input.compiled_truth)) {
    const updated = db.prepare('SELECT * FROM entities WHERE id = ?').get(existing.id) as Entity;
    const text = [updated.name, updated.entity_type, ...(updated.observations ? JSON.parse(updated.observations) as string[] : [])].join(' ');
    const vec = await embed(text);
    if (vec) db.prepare('INSERT OR REPLACE INTO vec_entities(rowid, embedding) VALUES (?, ?)').run(existing.id, serializeVec(vec));
  }
  return changed;
}

export function deleteEntity(name: string, agentId = 'default'): boolean {
  const db = getDb();
  const row = db.prepare('SELECT id FROM entities WHERE name = ? AND agent_id = ?').get(name, agentId) as { id: number } | undefined;
  if (!row) return false;
  if (isVecLoaded()) db.prepare('DELETE FROM vec_entities WHERE rowid = ?').run(row.id);
  return db.prepare('DELETE FROM entities WHERE id = ?').run(row.id).changes > 0;
}

export function getEntitiesWithoutEmbeddings(agentId: string, limit: number): Entity[] {
  const db = getDb();
  return db.prepare(`
    SELECT e.* FROM entities e
    LEFT JOIN vec_entities v ON v.rowid = e.id
    WHERE e.agent_id = @agent_id AND v.rowid IS NULL
    LIMIT @limit
  `).all({ agent_id: agentId, limit }) as Entity[];
}

export function relateEntities(
  fromName: string,
  relation: string,
  toName: string,
  agentId = 'default'
): void {
  const db = getDb();

  const from = db.prepare(
    'SELECT id FROM entities WHERE name = @name AND agent_id = @agent_id'
  ).get({ name: fromName, agent_id: agentId }) as { id: number } | undefined;

  const to = db.prepare(
    'SELECT id FROM entities WHERE name = @name AND agent_id = @agent_id'
  ).get({ name: toName, agent_id: agentId }) as { id: number } | undefined;

  if (!from || !to) {
    throw new Error(`Entity not found: ${!from ? fromName : toName}`);
  }

  db.prepare(`
    INSERT OR REPLACE INTO knowledge_edges (from_type, from_id, relation, to_type, to_id)
    VALUES ('entity', @from_id, @relation, 'entity', @to_id)
  `).run({ from_id: from.id, relation, to_id: to.id });
}

export function getEntityRelations(name: string, agentId = 'default') {
  const db = getDb();
  const entity = getEntity(name, agentId);
  if (!entity) return [];

  return db.prepare(`
    SELECT ke.relation, ke.weight, e.name as to_name, e.entity_type as to_type
    FROM knowledge_edges ke
    JOIN entities e ON e.id = ke.to_id
    WHERE ke.from_type = 'entity' AND ke.from_id = @id AND ke.to_type = 'entity'
    UNION ALL
    SELECT ke.relation, ke.weight, e.name as to_name, e.entity_type as to_type
    FROM knowledge_edges ke
    JOIN entities e ON e.id = ke.from_id
    WHERE ke.to_type = 'entity' AND ke.to_id = @id AND ke.from_type = 'entity'
  `).all({ id: entity.id });
}
