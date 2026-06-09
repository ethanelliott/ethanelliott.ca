import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  upsertBelief, listBeliefs,
  recordInteraction, getTrust, listTrust,
  reflect, listReflections,
  upsertWorkspace, getWorkspace, listWorkspace,
  createTask, updateTaskStatus, listTasks,
  upsertPolicy, evaluatePolicy, listPolicies,
} from '../services/subsystems.service.js';

const AgentQ = z.object({ agent_id: z.string().optional() });

export async function SubsystemRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // ---- belief ----
  f.post('/belief', {
    schema: {
      body: z.object({
        claim: z.string().min(1),
        confidence: z.number().min(0).max(1).optional(),
        evidence_for: z.string().optional(),
        evidence_against: z.string().optional(),
        source: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.status(201).send({ id: upsertBelief(req.body) }));

  f.get('/belief', {
    schema: { querystring: AgentQ.extend({ min_confidence: z.coerce.number().optional() }) },
  }, async (req, reply) => reply.send(listBeliefs(req.query.agent_id ?? 'default', req.query.min_confidence)));

  // ---- trust ----
  f.post('/trust/interaction', {
    schema: {
      body: z.object({
        target: z.string().min(1),
        outcome: z.enum(['positive', 'negative', 'neutral']),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send(recordInteraction(req.body)));

  f.get('/trust', {
    schema: { querystring: AgentQ },
  }, async (req, reply) => reply.send(listTrust(req.query.agent_id ?? 'default')));

  f.get('/trust/:target', {
    schema: { params: z.object({ target: z.string() }), querystring: AgentQ },
  }, async (req, reply) => {
    const record = getTrust(req.params.target, req.query.agent_id ?? 'default');
    if (!record) return reply.status(404).send({ error: 'Trust record not found' });
    return reply.send(record);
  });

  // ---- reflexion ----
  f.post('/reflexion', {
    schema: {
      body: z.object({
        action: z.string().min(1),
        outcome: z.string().min(1),
        generate_lesson: z.boolean().optional(),
        model: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.status(201).send(await reflect(req.body)));

  f.get('/reflexion', {
    schema: { querystring: AgentQ.extend({ limit: z.coerce.number().int().optional() }) },
  }, async (req, reply) => reply.send(listReflections(req.query.agent_id ?? 'default', req.query.limit)));

  // ---- workspace ----
  f.put('/workspace/:name', {
    schema: {
      params: z.object({ name: z.string() }),
      body: z.object({
        content: z.string(),
        workspace_type: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send({ id: upsertWorkspace({ name: req.params.name, ...req.body }) }));

  f.get('/workspace', {
    schema: { querystring: AgentQ.extend({ status: z.string().optional() }) },
  }, async (req, reply) => reply.send(listWorkspace(req.query.agent_id ?? 'default', req.query.status)));

  f.get('/workspace/:name', {
    schema: { params: z.object({ name: z.string() }), querystring: AgentQ },
  }, async (req, reply) => {
    const item = getWorkspace(req.params.name, req.query.agent_id ?? 'default');
    if (!item) return reply.status(404).send({ error: 'Workspace item not found' });
    return reply.send(item);
  });

  // ---- task ----
  f.post('/tasks', {
    schema: {
      body: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
        assignee: z.string().optional(),
        due_at: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.status(201).send({ id: createTask(req.body) }));

  f.patch('/tasks/:id/status', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      body: z.object({
        status: z.string().min(1),
        result: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const ok = updateTaskStatus(req.params.id, req.body.status, req.body.result, req.body.agent_id);
    return reply.send({ updated: ok });
  });

  f.get('/tasks', {
    schema: { querystring: AgentQ.extend({ status: z.string().optional(), assignee: z.string().optional() }) },
  }, async (req, reply) => reply.send(listTasks(req.query.agent_id ?? 'default', req.query.status, req.query.assignee)));

  // ---- policy ----
  f.put('/policy/:name', {
    schema: {
      params: z.object({ name: z.string() }),
      body: z.object({
        rule: z.string().min(1),
        scope: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send({ id: upsertPolicy({ name: req.params.name, ...req.body }) }));

  f.post('/policy/:name/evaluate', {
    schema: {
      params: z.object({ name: z.string() }),
      body: z.object({
        context: z.string().min(1),
        model: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send(await evaluatePolicy({ name: req.params.name, ...req.body })));

  f.get('/policy', {
    schema: { querystring: AgentQ.extend({ active_only: z.coerce.boolean().optional() }) },
  }, async (req, reply) => reply.send(listPolicies(req.query.agent_id ?? 'default', req.query.active_only !== false)));
}
