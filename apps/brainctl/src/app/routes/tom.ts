import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  modelAgent, getLatestTomModel, listTomModels,
  setBudget, recordBudgetUsage, resetBudget, getBudgetStatus,
} from '../services/tom.service.js';

export async function TomRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // ---- Theory of Mind ----

  // Model another agent's beliefs/intentions from their memory records
  f.post('/tom/model', {
    schema: {
      body: z.object({
        observer_agent: z.string().min(1),
        subject_agent: z.string().min(1),
        topic: z.string().optional(),
        model: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send(await modelAgent(req.body)));

  // Retrieve the latest ToM model for a subject
  f.get('/tom/:observer/model/:subject', {
    schema: {
      params: z.object({ observer: z.string(), subject: z.string() }),
    },
  }, async (req, reply) => {
    const model = getLatestTomModel(req.params.observer, req.params.subject);
    if (!model) return reply.status(404).send({ error: 'No ToM model found' });
    return reply.send(model);
  });

  // List all ToM models produced by an observer agent
  f.get('/tom/:observer/models', {
    schema: { params: z.object({ observer: z.string() }) },
  }, async (req, reply) => reply.send(listTomModels(req.params.observer)));

  // ---- Budget ----

  // Set or update token/call budget for an agent
  f.put('/budget/:agent_id', {
    schema: {
      params: z.object({ agent_id: z.string() }),
      body: z.object({
        token_budget: z.number().int().min(0).optional(),
        call_budget: z.number().int().min(0).optional(),
        reset_at: z.string().optional(),
      }),
    },
  }, async (req, reply) =>
    reply.send(setBudget({ agent_id: req.params.agent_id, ...req.body })));

  // Get current budget status
  f.get('/budget/:agent_id', {
    schema: { params: z.object({ agent_id: z.string() }) },
  }, async (req, reply) => reply.send(getBudgetStatus(req.params.agent_id)));

  // Record token/call usage against budget
  f.post('/budget/:agent_id/usage', {
    schema: {
      params: z.object({ agent_id: z.string() }),
      body: z.object({
        tokens_used: z.number().int().min(0),
        calls: z.number().int().min(1).optional(),
      }),
    },
  }, async (req, reply) =>
    reply.send(recordBudgetUsage(req.params.agent_id, req.body.tokens_used, req.body.calls)));

  // Reset usage counters
  f.post('/budget/:agent_id/reset', {
    schema: { params: z.object({ agent_id: z.string() }) },
  }, async (req, reply) => reply.send(resetBudget(req.params.agent_id)));
}
