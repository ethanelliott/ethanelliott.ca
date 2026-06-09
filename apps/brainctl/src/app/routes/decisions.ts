import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createDecision, listDecisions } from '../services/decision.service.js';

export async function DecisionRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post('/decisions', {
    schema: {
      body: z.object({
        title: z.string().min(1),
        rationale: z.string().min(1),
        project: z.string().optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        201: z.object({ id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const id = createDecision(req.body);
    return reply.status(201).send({ id });
  });

  f.get('/decisions', {
    schema: {
      querystring: z.object({
        project: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const results = listDecisions(req.query.agent_id, req.query.project, req.query.limit);
    return reply.send(results);
  });
}
