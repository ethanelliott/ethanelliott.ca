import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  classifyAffect, logAffect,
  getAffectState, getAffectHistory,
  setThreshold, listThresholds, deleteThreshold, checkThresholds,
} from '../services/affect.service.js';

export async function AffectRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post('/affect', {
    schema: {
      body: z.object({
        text: z.string().min(1),
        source: z.string().optional(),
        agent_id: z.string().optional(),
        store: z.boolean().optional(),
      }),
    },
  }, async (req, reply) => {
    const result = classifyAffect(req.body.text);

    if (req.body.store) {
      const id = logAffect(req.body.text, req.body.source ?? 'observation', req.body.agent_id);
      return reply.send({ ...result, stored_id: id });
    }

    return reply.send(result);
  });

  // Current rolling affect state for an agent
  f.get('/affect/state', {
    schema: {
      querystring: z.object({
        agent_id: z.string().optional(),
        window_minutes: z.coerce.number().int().min(1).max(10080).optional(),
      }),
    },
  }, async (req, reply) =>
    reply.send(getAffectState(req.query.agent_id ?? 'default', req.query.window_minutes ?? 60)));

  // Recent affect log entries
  f.get('/affect/history', {
    schema: {
      querystring: z.object({
        agent_id: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      }),
    },
  }, async (req, reply) =>
    reply.send(getAffectHistory(req.query.agent_id ?? 'default', req.query.limit ?? 50)));

  // Upsert a threshold for a metric (valence, arousal, or dominance)
  f.put('/affect/thresholds/:metric', {
    schema: {
      params: z.object({ metric: z.enum(['valence', 'arousal', 'dominance']) }),
      body: z.object({
        operator: z.enum(['>', '<', '>=', '<=', '==', '=']),
        value: z.number().min(-1).max(1),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const id = setThreshold(
      req.body.agent_id ?? 'default',
      req.params.metric,
      req.body.operator,
      req.body.value,
    );
    return reply.send({ id });
  });

  // List thresholds
  f.get('/affect/thresholds', {
    schema: { querystring: z.object({ agent_id: z.string().optional() }) },
  }, async (req, reply) => reply.send(listThresholds(req.query.agent_id ?? 'default')));

  // Delete a threshold
  f.delete('/affect/thresholds/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const deleted = deleteThreshold(req.query.agent_id ?? 'default', req.params.id);
    return reply.send({ deleted });
  });

  // Check current affect state against all configured thresholds
  f.get('/affect/monitor', {
    schema: {
      querystring: z.object({
        agent_id: z.string().optional(),
        window_minutes: z.coerce.number().int().min(1).max(10080).optional(),
      }),
    },
  }, async (req, reply) => {
    const breaches = checkThresholds(req.query.agent_id ?? 'default', req.query.window_minutes ?? 60);
    const any_breach = breaches.some((b) => b.breached);
    return reply.send({ any_breach, breaches });
  });
}
