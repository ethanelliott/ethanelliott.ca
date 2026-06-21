import { getDb } from '../db/database.js';
import { searchMemories, searchMemoriesVec, Memory } from './memory.service.js';
import { searchEvents, BrainEvent } from './event.service.js';
import { searchEntities, searchEntitiesVec, Entity } from './entity.service.js';

export interface UnifiedSearchResult {
  memories: Memory[];
  events: BrainEvent[];
  entities: Entity[];
}

export interface VsearchResult {
  memories: Memory[];
  entities: Entity[];
}

export interface ThinkResult {
  seeds: Memory[];
  activated: Array<{ id: number; content: string; type: string; activation: number }>;
}

export async function unifiedSearch(
  query: string,
  limit = 10,
  agentId = 'default'
): Promise<UnifiedSearchResult> {
  const perType = Math.ceil(limit / 3);
  const [memories, events, entities] = await Promise.all([
    searchMemories({ query, limit: perType, agent_id: agentId }),
    searchEvents({ query, limit: perType, agent_id: agentId }),
    searchEntities({ query, limit: perType, agent_id: agentId }),
  ]);
  return { memories, events, entities };
}

export async function vsearch(
  query: string,
  limit = 10,
  agentId = 'default'
): Promise<VsearchResult> {
  const [memories, entities] = await Promise.all([
    searchMemoriesVec({ query, limit, agent_id: agentId }),
    searchEntitiesVec({ query, limit, agent_id: agentId }),
  ]);
  return { memories, entities };
}

export async function think(
  query: string,
  agentId = 'default',
  seedLimit = 5,
  hops = 2,
  decay = 0.6,
  topK = 20
): Promise<ThinkResult> {
  const db = getDb();
  const seeds = await searchMemories({ query, limit: seedLimit, agent_id: agentId });

  if (!seeds.length) return { seeds: [], activated: [] };

  const activations = new Map<string, { id: number; content: string; type: string; activation: number }>();

  for (const seed of seeds) {
    const key = `memory:${seed.id}`;
    const existing = activations.get(key);
    activations.set(key, {
      id: seed.id,
      content: seed.content,
      type: 'memory',
      activation: Math.max(existing?.activation ?? 0, seed.confidence),
    });
  }

  let frontier = seeds.map((s) => ({ id: s.id, type: 'memory', activation: s.confidence }));

  for (let hop = 0; hop < hops; hop++) {
    const nextFrontier: typeof frontier = [];

    for (const node of frontier) {
      const edges = db.prepare(`
        SELECT ke.to_type, ke.to_id, ke.from_type, ke.from_id, ke.weight, m.content, m.confidence
        FROM knowledge_edges ke
        JOIN memories m ON m.id = ke.to_id
        WHERE ke.from_type = @type AND ke.from_id = @id AND ke.to_type = 'memory'
          AND m.agent_id = @agent_id AND m.retired_at IS NULL
        UNION ALL
        SELECT ke.to_type, ke.to_id, ke.from_type, ke.from_id, ke.weight, m.content, m.confidence
        FROM knowledge_edges ke
        JOIN memories m ON m.id = ke.from_id
        WHERE ke.to_type = @type AND ke.to_id = @id AND ke.from_type = 'memory'
          AND m.agent_id = @agent_id AND m.retired_at IS NULL
      `).all({ type: node.type, id: node.id, agent_id: agentId }) as Array<{
        to_id: number; from_id: number; weight: number; content: string; confidence: number;
        from_type: string; to_type: string;
      }>;

      for (const edge of edges) {
        const neighborId = edge.to_type === 'memory' ? edge.to_id : edge.from_id;
        const newActivation = node.activation * decay * edge.weight;
        const nk = `memory:${neighborId}`;
        const existing = activations.get(nk);

        if (!existing || existing.activation < newActivation) {
          activations.set(nk, {
            id: neighborId,
            content: edge.content,
            type: 'memory',
            activation: newActivation,
          });
          nextFrontier.push({ id: neighborId, type: 'memory', activation: newActivation });
        }
      }
    }

    frontier = nextFrontier;
    if (!frontier.length) break;
  }

  const activated = Array.from(activations.values())
    .sort((a, b) => b.activation - a.activation)
    .slice(0, topK);

  return { seeds, activated };
}
