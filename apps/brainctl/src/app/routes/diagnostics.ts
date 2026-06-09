import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getStats, checkHealth } from '../services/diagnostics.service.js';

export async function DiagnosticsRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get('/health', {
    schema: {
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const health = checkHealth(req.query.agent_id);
    const status = health.healthy ? 200 : 503;
    return reply.status(status).send(health);
  });

  f.get('/stats', {
    schema: {
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const stats = getStats(req.query.agent_id);
    return reply.send(stats);
  });
}
