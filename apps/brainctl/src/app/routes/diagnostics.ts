import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getStats, checkHealth } from '../services/diagnostics.service.js';

const HealthSchema = z.object({
  ok: z.boolean(),
  healthy: z.boolean(),
  issues: z.array(z.string()),
  fts5_available: z.boolean(),
  vec_available: z.boolean(),
  embedding_available: z.boolean(),
  embedding_dimensions: z.number(),
  embedding_model: z.string(),
  db_size_mb: z.number(),
  db_path: z.string(),
}).passthrough();

const StatsSchema = z.record(z.unknown());

export async function DiagnosticsRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get('/health', {
    schema: {
      querystring: z.object({ agent_id: z.string().optional() }),
      response: {
        200: HealthSchema,
        503: HealthSchema,
      },
    },
  }, async (req, reply) => {
    const health = checkHealth(req.query.agent_id);
    const status = health.healthy ? 200 : 503;
    return reply.status(status).send(health);
  });

  f.get('/stats', {
    schema: {
      querystring: z.object({ agent_id: z.string().optional() }),
      response: {
        200: StatsSchema,
      },
    },
  }, async (req, reply) => {
    const stats = getStats(req.query.agent_id);
    return reply.send(stats);
  });
}
