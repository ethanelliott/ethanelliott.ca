import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createTrigger, checkTriggers, getActiveTriggers, deleteTrigger } from '../services/trigger.service.js';

export async function TriggerRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post('/triggers', {
    schema: {
      body: z.object({
        condition: z.string().min(1),
        keywords: z.string().min(1),
        action: z.string().min(1),
        priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        expires: z.string().optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        201: z.object({ id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const id = createTrigger(req.body);
    return reply.status(201).send({ id });
  });

  f.get('/triggers', {
    schema: {
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const triggers = getActiveTriggers(req.query.agent_id);
    return reply.send(triggers);
  });

  f.get('/triggers/check', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const matches = checkTriggers(req.query.q, req.query.agent_id);
    return reply.send(matches);
  });

  f.delete('/triggers/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
      response: {
        200: z.object({ deleted: z.boolean() }),
      },
    },
  }, async (req, reply) => {
    const deleted = deleteTrigger(req.params.id, req.query.agent_id);
    return reply.send({ deleted });
  });
}
