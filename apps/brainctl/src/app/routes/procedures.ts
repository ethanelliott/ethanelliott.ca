import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createProcedure,
  getProcedure,
  listProcedures,
  searchProcedures,
  recordFeedback,
  updateProcedure,
  deleteProcedure,
} from '../services/procedure.service.js';

const StepSchema = z.object({
  step: z.number().int(),
  action: z.string(),
  notes: z.string().optional(),
});

export async function ProcedureRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post('/procedures', {
    schema: {
      body: z.object({
        goal: z.string().min(1),
        title: z.string().optional(),
        description: z.string().optional(),
        steps: z.array(StepSchema).optional(),
        procedure_kind: z.string().optional(),
        scope: z.string().optional(),
        category: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        201: z.object({ id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const id = createProcedure(req.body);
    return reply.status(201).send({ id });
  });

  f.get('/procedures/search', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        scope: z.string().optional(),
        status: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const results = searchProcedures({
      query: req.query.q,
      limit: req.query.limit,
      scope: req.query.scope,
      status: req.query.status,
      agent_id: req.query.agent_id,
    });
    return reply.send(results);
  });

  f.get('/procedures', {
    schema: {
      querystring: z.object({
        status: z.string().optional(),
        scope: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const results = listProcedures(req.query);
    return reply.send(results);
  });

  f.get('/procedures/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const proc = getProcedure(req.params.id, req.query.agent_id);
    if (!proc) return reply.status(404).send({ error: 'Procedure not found' });
    return reply.send(proc);
  });

  f.patch('/procedures/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      body: z.object({
        goal: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        steps: z.array(StepSchema).optional(),
        procedure_kind: z.string().optional(),
        scope: z.string().optional(),
        category: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
        status: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const updated = updateProcedure(req.params.id, req.body);
    if (!updated) return reply.status(404).send({ error: 'Procedure not found' });
    return reply.send({ updated });
  });

  f.delete('/procedures/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const deleted = deleteProcedure(req.params.id, req.query.agent_id ?? 'default');
    if (!deleted) return reply.status(404).send({ error: 'Procedure not found' });
    return reply.send({ deleted });
  });

  f.post('/procedures/:id/feedback', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      body: z.object({
        success: z.boolean(),
        usefulness_score: z.number().min(0).max(1).optional(),
        outcome_summary: z.string().optional(),
        errors_seen: z.string().optional(),
        validated: z.boolean().optional(),
        task_signature: z.string().optional(),
        input_summary: z.string().optional(),
      }),
      response: {
        201: z.object({ id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const id = recordFeedback({ procedure_id: req.params.id, ...req.body });
    return reply.status(201).send({ id });
  });
}
