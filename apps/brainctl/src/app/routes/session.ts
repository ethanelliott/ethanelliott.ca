import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createHandoff, getLatestHandoff, orient, wrapUp } from '../services/session.service.js';

export async function SessionRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get('/session/orient', {
    schema: {
      querystring: z.object({
        project: z.string().optional(),
        q: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const result = await orient({
      project: req.query.project,
      query: req.query.q,
      agent_id: req.query.agent_id,
    });
    return reply.send(result);
  });

  f.post('/session/wrap-up', {
    schema: {
      body: z.object({
        summary: z.string().min(1),
        goal: z.string().optional(),
        open_loops: z.string().optional(),
        next_step: z.string().optional(),
        project: z.string().optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        200: z.object({ event_id: z.number(), handoff_id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const result = await wrapUp(req.body);
    return reply.send(result);
  });

  f.post('/session/handoff', {
    schema: {
      body: z.object({
        goal: z.string().min(1),
        current_state: z.string().min(1),
        open_loops: z.string().min(1),
        next_step: z.string().min(1),
        project: z.string().optional(),
        title: z.string().optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        201: z.object({ id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const id = createHandoff(req.body);
    return reply.status(201).send({ id });
  });

  f.get('/session/handoff/latest', {
    schema: {
      querystring: z.object({
        project: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const handoff = getLatestHandoff(req.query.agent_id, req.query.project);
    if (!handoff) return reply.status(404).send({ error: 'No pending handoff' });
    return reply.send(handoff);
  });
}
