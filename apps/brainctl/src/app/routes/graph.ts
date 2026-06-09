import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { computePageRank, whosKnows, traverse } from '../services/graph.service.js';

export async function GraphRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // PageRank over the knowledge graph for this agent
  f.get('/graph/pagerank', {
    schema: {
      querystring: z.object({
        agent_id: z.string().optional(),
        iterations: z.coerce.number().int().min(1).max(100).optional(),
        damping: z.coerce.number().min(0).max(1).optional(),
        top_k: z.coerce.number().int().min(1).max(200).optional(),
      }),
    },
  }, async (req, reply) => {
    const nodes = computePageRank(
      req.query.agent_id ?? 'default',
      req.query.iterations,
      req.query.damping,
      req.query.top_k,
    );
    return reply.send(nodes);
  });

  // Which entities have the most knowledge touching a topic?
  f.get('/graph/whosknows', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        agent_id: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    },
  }, async (req, reply) => {
    const results = await whosKnows(req.query.q, req.query.agent_id ?? 'default', req.query.limit);
    return reply.send(results);
  });

  // Multi-hop traversal from a starting node
  f.get('/graph/traverse', {
    schema: {
      querystring: z.object({
        type: z.enum(['memory', 'entity']),
        id: z.coerce.number().int(),
        agent_id: z.string().optional(),
        depth: z.coerce.number().int().min(1).max(6).optional(),
        max_nodes: z.coerce.number().int().min(1).max(200).optional(),
      }),
    },
  }, async (req, reply) => {
    const nodes = traverse(
      req.query.type,
      req.query.id,
      req.query.agent_id ?? 'default',
      req.query.depth,
      req.query.max_nodes,
    );
    return reply.send(nodes);
  });
}
