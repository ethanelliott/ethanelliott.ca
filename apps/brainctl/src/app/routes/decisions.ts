import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createDecision, listDecisions, getDecision, deleteDecision } from '../services/decision.service.js';

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

  f.get('/decisions/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const decision = getDecision(req.params.id, req.query.agent_id ?? 'default');
    if (!decision) return reply.status(404).send({ error: 'Decision not found' });
    return reply.send(decision);
  });

  f.delete('/decisions/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const deleted = deleteDecision(req.params.id, req.query.agent_id ?? 'default');
    if (!deleted) return reply.status(404).send({ error: 'Decision not found' });
    return reply.send({ deleted });
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
