import { getDb } from '../db/database.js';
import { searchMemories, Memory } from './memory.service.js';
import { searchEvents, BrainEvent } from './event.service.js';
import { searchEntities, Entity } from './entity.service.js';

export interface UnifiedSearchResult {
  memories: Memory[];
  events: BrainEvent[];
  entities: Entity[];
}

export interface ThinkResult {
  seeds: Memory[];
  activated: Array<{ id: number; content: string; type: string; activation: number }>;
}

export function unifiedSearch(query: string, limit = 10, agentId = 'default'): UnifiedSearchResult {
  const perType = Math.ceil(limit / 3);
  return {
    memories: searchMemories({ query, limit: perType, agent_id: agentId }),
    events: searchEvents({ query, limit: perType, agent_id: agentId }),
    entities: searchEntities({ query, limit: perType, agent_id: agentId }),
  };
}

export function think(
  query: string,
  agentId = 'default',
  seedLimit = 5,
  hops = 2,
  decay = 0.6,
  topK = 20
): ThinkResult {
  const db = getDb();
  const seeds = searchMemories({ query, limit: seedLimit, agent_id: agentId });

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
        SELECT ke.*, m.content, m.confidence
        FROM knowledge_edges ke
        JOIN memories m ON m.id = ke.to_id
        WHERE ke.from_type = @type AND ke.from_id = @id AND ke.to_type = 'memory'
          AND m.agent_id = @agent_id AND m.retired_at IS NULL
        UNION ALL
        SELECT ke.*, m.content, m.confidence
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
