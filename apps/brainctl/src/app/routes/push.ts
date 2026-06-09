import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  upsertWebhook, listWebhooks, deleteWebhook,
  pushMemories, pushReport,
} from '../services/push.service.js';

export async function PushRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // ---- Webhooks ----

  f.put('/webhooks/:name', {
    schema: {
      params: z.object({ name: z.string().min(1) }),
      body: z.object({
        url: z.string().url(),
        secret: z.string().optional(),
        events: z.string().optional(),
      }),
    },
  }, async (req, reply) =>
    reply.status(201).send({ id: upsertWebhook({ name: req.params.name, ...req.body }) }));

  f.get('/webhooks', async (_req, reply) => reply.send(listWebhooks()));

  f.delete('/webhooks/:name', {
    schema: { params: z.object({ name: z.string().min(1) }) },
  }, async (req, reply) => reply.send({ deleted: deleteWebhook(req.params.name) }));

  // ---- Push ----

  // Push memories to a webhook (by query or explicit IDs)
  f.post('/push', {
    schema: {
      body: z.object({
        webhook: z.string().min(1),
        query: z.string().optional(),
        memory_ids: z.array(z.number().int()).max(500).optional(),
        event_type: z.string().optional(),
        agent_id: z.string().optional(),
      }).refine((b) => b.query || b.memory_ids?.length, { message: 'Provide query or memory_ids' }),
    },
  }, async (req, reply) => {
    try {
      return reply.send(await pushMemories(req.body));
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // Push a structured report to a webhook
  f.post('/push/report', {
    schema: {
      body: z.object({
        webhook: z.string().min(1),
        title: z.string().min(1),
        body: z.record(z.unknown()),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    try {
      return reply.send(await pushReport(req.body));
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });
}
