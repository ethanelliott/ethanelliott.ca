import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { unifiedSearch, think } from '../services/search.service.js';

export async function SearchRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get('/search', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const results = unifiedSearch(req.query.q, req.query.limit, req.query.agent_id);
    return reply.send(results);
  });

  f.get('/think', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        seed_limit: z.coerce.number().int().min(1).max(20).optional(),
        hops: z.coerce.number().int().min(1).max(5).optional(),
        decay: z.coerce.number().min(0).max(1).optional(),
        top_k: z.coerce.number().int().min(1).max(100).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const result = think(
      req.query.q,
      req.query.agent_id,
      req.query.seed_limit,
      req.query.hops,
      req.query.decay,
      req.query.top_k,
    );
    return reply.send(result);
  });
}
