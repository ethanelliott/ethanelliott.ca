import { getDb } from '../db/database.js';

export interface PageRankNode {
  type: string;
  id: number;
  label: string;
  score: number;
  in_degree: number;
  out_degree: number;
}

export interface WhosKnowsResult {
  entity: string;
  entity_type: string;
  edge_count: number;
  memory_count: number;
  score: number;
}

export interface TraversalNode {
  type: string;
  id: number;
  label: string;
  depth: number;
  relation: string | null;
  weight: number;
}

// ---------------------------------------------------------------------------
// Weighted iterative PageRank over the agent's knowledge_edges subgraph.
// PR(u) = (1-d)/N + d * Σ_v [ PR(v) * w(v→u) / Σ_w w(v→w) ]
// Edge weight is used as the transfer probability — higher-weight edges
// propagate more score. Retired memories are excluded from the graph.
// ---------------------------------------------------------------------------

export function computePageRank(
  agentId: string,
  iterations = 20,
  damping = 0.85,
  topK = 50
): PageRankNode[] {
  const db = getDb();

  // Build adjacency from knowledge_edges for this agent's memories + entities
  const edges = db.prepare(`
    SELECT ke.from_type, ke.from_id, ke.to_type, ke.to_id, ke.weight
    FROM knowledge_edges ke
    WHERE (ke.from_type = 'memory' AND EXISTS (
        SELECT 1 FROM memories m WHERE m.id = ke.from_id AND m.agent_id = @a AND m.retired_at IS NULL
      ))
      OR (ke.from_type = 'entity' AND EXISTS (
        SELECT 1 FROM entities e WHERE e.id = ke.from_id AND e.agent_id = @a
      ))
  `).all({ a: agentId }) as Array<{
    from_type: string; from_id: number; to_type: string; to_id: number; weight: number;
  }>;

  if (!edges.length) return [];

  // Collect all unique nodes
  const nodeKeys = new Set<string>();
  for (const e of edges) {
    nodeKeys.add(`${e.from_type}:${e.from_id}`);
    nodeKeys.add(`${e.to_type}:${e.to_id}`);
  }

  const N = nodeKeys.size;
  const scores = new Map<string, number>();
  const outEdges = new Map<string, Array<{ to: string; weight: number }>>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const key of nodeKeys) {
    scores.set(key, 1 / N);
    outEdges.set(key, []);
    inDegree.set(key, 0);
    outDegree.set(key, 0);
  }

  for (const e of edges) {
    const from = `${e.from_type}:${e.from_id}`;
    const to = `${e.to_type}:${e.to_id}`;
    outEdges.get(from)!.push({ to, weight: e.weight });
    outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map<string, number>();
    for (const key of nodeKeys) next.set(key, (1 - damping) / N);

    for (const [from, neighbors] of outEdges) {
      const fromScore = scores.get(from) ?? 0;
      const totalWeight = neighbors.reduce((s, n) => s + n.weight, 0);
      if (totalWeight === 0) continue;
      for (const { to, weight } of neighbors) {
        next.set(to, (next.get(to) ?? 0) + damping * fromScore * (weight / totalWeight));
      }
    }

    for (const [key, val] of next) scores.set(key, val);
  }

  // Resolve labels
  const memoryLabels = new Map<number, string>();
  const entityLabels = new Map<number, string>();

  const memIds = [...nodeKeys].filter((k) => k.startsWith('memory:')).map((k) => parseInt(k.split(':')[1]));
  const entIds = [...nodeKeys].filter((k) => k.startsWith('entity:')).map((k) => parseInt(k.split(':')[1]));

  if (memIds.length) {
    const rows = db.prepare(
      `SELECT id, content FROM memories WHERE id IN (${memIds.map(() => '?').join(',')})`
    ).all(...memIds) as Array<{ id: number; content: string }>;
    for (const r of rows) memoryLabels.set(r.id, r.content.slice(0, 80));
  }
  if (entIds.length) {
    const rows = db.prepare(
      `SELECT id, name FROM entities WHERE id IN (${entIds.map(() => '?').join(',')})`
    ).all(...entIds) as Array<{ id: number; name: string }>;
    for (const r of rows) entityLabels.set(r.id, r.name);
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([key, score]) => {
      const [type, idStr] = key.split(':');
      const id = parseInt(idStr);
      const label = type === 'memory'
        ? (memoryLabels.get(id) ?? `memory:${id}`)
        : (entityLabels.get(id) ?? `entity:${id}`);
      return { type, id, label, score, in_degree: inDegree.get(key) ?? 0, out_degree: outDegree.get(key) ?? 0 };
    });
}

// ---------------------------------------------------------------------------
// whosknows — which entities have the most knowledge about a topic
// ---------------------------------------------------------------------------

export async function whosKnows(
  query: string,
  agentId: string,
  limit = 10
): Promise<WhosKnowsResult[]> {
  const db = getDb();

  // Find entities whose name, type, or observations match the query
  const sanitized = query
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .join(' OR ');

  let matchedEntities: Array<{ id: number; name: string; entity_type: string }> = [];

  if (sanitized) {
    try {
      matchedEntities = db.prepare(`
        SELECT e.id, e.name, e.entity_type
        FROM entities e
        JOIN entities_fts fts ON fts.rowid = e.id
        WHERE entities_fts MATCH @q AND e.agent_id = @a
        ORDER BY rank LIMIT @limit
      `).all({ q: sanitized, a: agentId, limit: limit * 2 }) as typeof matchedEntities;
    } catch {
      matchedEntities = db.prepare(`
        SELECT id, name, entity_type FROM entities
        WHERE agent_id = @a AND name LIKE @like
        LIMIT @limit
      `).all({ a: agentId, like: `%${query}%`, limit: limit * 2 }) as typeof matchedEntities;
    }
  }

  if (!matchedEntities.length) return [];

  return matchedEntities.slice(0, limit).map((e) => {
    const edgeCount = (db.prepare(`
      SELECT COUNT(*) AS cnt FROM knowledge_edges
      WHERE (from_type = 'entity' AND from_id = ?) OR (to_type = 'entity' AND to_id = ?)
    `).get(e.id, e.id) as { cnt: number }).cnt;

    const memoryCount = (db.prepare(`
      SELECT COUNT(*) AS cnt FROM knowledge_edges ke
      JOIN memories m ON m.id = ke.from_id OR m.id = ke.to_id
      WHERE ((ke.from_type = 'entity' AND ke.from_id = ?) OR (ke.to_type = 'entity' AND ke.to_id = ?))
        AND m.retired_at IS NULL
    `).get(e.id, e.id) as { cnt: number }).cnt;

    return {
      entity: e.name,
      entity_type: e.entity_type,
      edge_count: edgeCount,
      memory_count: memoryCount,
      score: edgeCount + memoryCount * 0.5,
    };
  }).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Multi-hop traversal from a named entity or memory id
// ---------------------------------------------------------------------------

export function traverse(
  startType: 'memory' | 'entity',
  startId: number,
  agentId: string,
  maxDepth = 3,
  maxNodes = 50
): TraversalNode[] {
  const db = getDb();
  const visited = new Set<string>();
  const result: TraversalNode[] = [];

  function labelFor(type: string, id: number): string {
    if (type === 'memory') {
      const r = db.prepare('SELECT content FROM memories WHERE id = ?').get(id) as { content: string } | undefined;
      return r ? r.content.slice(0, 80) : `memory:${id}`;
    }
    const r = db.prepare('SELECT name FROM entities WHERE id = ?').get(id) as { name: string } | undefined;
    return r ? r.name : `entity:${id}`;
  }

  const queue: Array<{ type: string; id: number; depth: number; relation: string | null; weight: number }> = [
    { type: startType, id: startId, depth: 0, relation: null, weight: 1 },
  ];

  while (queue.length && result.length < maxNodes) {
    const node = queue.shift()!;
    const key = `${node.type}:${node.id}`;
    if (visited.has(key)) continue;
    visited.add(key);

    result.push({ type: node.type, id: node.id, label: labelFor(node.type, node.id), depth: node.depth, relation: node.relation, weight: node.weight });

    if (node.depth >= maxDepth) continue;

    const neighbors = db.prepare(`
      SELECT 'out' AS dir, to_type AS ntype, to_id AS nid, relation, weight
      FROM knowledge_edges WHERE from_type = @type AND from_id = @id
      UNION ALL
      SELECT 'in' AS dir, from_type AS ntype, from_id AS nid, relation, weight
      FROM knowledge_edges WHERE to_type = @type AND to_id = @id
    `).all({ type: node.type, id: node.id }) as Array<{
      dir: string; ntype: string; nid: number; relation: string; weight: number;
    }>;

    for (const n of neighbors) {
      if (!visited.has(`${n.ntype}:${n.nid}`)) {
        queue.push({ type: n.ntype, id: n.nid, depth: node.depth + 1, relation: n.relation, weight: n.weight });
      }
    }
  }

  return result;
}
