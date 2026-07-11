import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  validateDatabase, freeEnergyCheck, allostaticPrime,
  demandForecast, retrievalEffectiveness,
} from '../services/analytics.service.js';

const AgentQ = z.object({ agent_id: z.string().optional() });

export async function AnalyticsRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // validate / lint — deep DB consistency check
  f.get('/analytics/validate', {
    schema: { querystring: AgentQ },
  }, async (req, reply) => {
    const result = validateDatabase(req.query.agent_id ?? 'default');
    return reply.status(result.valid ? 200 : 207).send(result);
  });

  // free_energy_check — homeostatic memory pressure metric
  f.get('/analytics/free-energy', {
    schema: {
      querystring: AgentQ.extend({
        capacity_target: z.coerce.number().int().min(100).optional(),
      }),
    },
  }, async (req, reply) =>
    reply.send(freeEnergyCheck(req.query.agent_id ?? 'default', req.query.capacity_target)));

  // allostatic_prime — memories near decay threshold
  f.get('/analytics/allostatic-prime', {
    schema: {
      querystring: AgentQ.extend({ limit: z.coerce.number().int().min(1).max(100).optional() }),
    },
  }, async (req, reply) =>
    reply.send(allostaticPrime(req.query.agent_id ?? 'default', req.query.limit)));

  // demand_forecast — predicted high-access memories
  f.get('/analytics/demand-forecast', {
    schema: {
      querystring: AgentQ.extend({ limit: z.coerce.number().int().min(1).max(100).optional() }),
    },
  }, async (req, reply) =>
    reply.send(demandForecast(req.query.agent_id ?? 'default', req.query.limit)));

  // retrieval_effectiveness — offline precision/recall testing
  f.post('/analytics/retrieval-effectiveness', {
    schema: {
      body: z.object({
        test_cases: z.array(z.object({
          query: z.string().min(1),
          expected_ids: z.array(z.number().int()).min(1),
        })).min(1).max(50),
        k: z.number().int().min(1).max(50).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send(await retrievalEffectiveness(req.body)));
}
