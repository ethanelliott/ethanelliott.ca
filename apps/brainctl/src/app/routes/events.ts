import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { logEvent, searchEvents, getRecentEvents, getEvent, deleteEvent, listEvents } from '../services/event.service.js';
import { EventSchema } from '../schemas.js';

export async function EventRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get('/events', {
    schema: {
      querystring: z.object({
        event_type: z.string().optional(),
        project: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        agent_id: z.string().optional(),
      }),
      response: { 200: z.array(EventSchema) },
    },
  }, async (req, reply) => reply.send(listEvents(req.query)));

  f.get('/events/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const event = getEvent(req.params.id, req.query.agent_id ?? 'default');
    if (!event) return reply.status(404).send({ error: 'Event not found' });
    return reply.send(event);
  });

  f.delete('/events/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const deleted = deleteEvent(req.params.id, req.query.agent_id ?? 'default');
    if (!deleted) return reply.status(404).send({ error: 'Event not found' });
    return reply.send({ deleted });
  });

  f.post('/events', {
    schema: {
      body: z.object({
        summary: z.string().min(1),
        event_type: z.string().optional(),
        project: z.string().optional(),
        importance: z.number().min(0).max(1).optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        201: z.object({ id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const id = await logEvent(req.body);
    return reply.status(201).send({ id });
  });

  f.get('/events/search', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        event_type: z.string().optional(),
        project: z.string().optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        200: z.array(EventSchema),
      },
    },
  }, async (req, reply) => {
    const results = await searchEvents({
      query: req.query.q,
      limit: req.query.limit,
      event_type: req.query.event_type,
      project: req.query.project,
      agent_id: req.query.agent_id,
    });
    return reply.send(results);
  });

  f.get('/events/recent', {
    schema: {
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        200: z.array(EventSchema),
      },
    },
  }, async (req, reply) => {
    const results = getRecentEvents(req.query.agent_id, req.query.limit);
    return reply.send(results);
  });
}
