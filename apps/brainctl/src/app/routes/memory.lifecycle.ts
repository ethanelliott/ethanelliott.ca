import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  zoomIn, zoomOut, abstractSummarize,
  retirementAnalysis, resolveConflict,
  quarantineMemory, unquarantineMemory, listQuarantined,
  searchPatterns,
} from '../services/memory.lifecycle.service.js';

const AgentQ = z.object({ agent_id: z.string().optional() });

export async function MemoryLifecycleRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // zoom_in — granular memories related to a seed
  f.get('/memories/:id/zoom-in', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: AgentQ.extend({ limit: z.coerce.number().int().min(1).max(50).optional() }),
    },
  }, async (req, reply) =>
    reply.send(await zoomIn({ id: req.params.id, agent_id: req.query.agent_id, limit: req.query.limit })));

  // zoom_out — abstract summary of a cluster of memories
  f.post('/memories/zoom-out', {
    schema: {
      body: z.object({
        ids: z.array(z.number().int()).min(1).max(100).optional(),
        query: z.string().optional(),
        store: z.boolean().optional(),
        model: z.string().optional(),
        agent_id: z.string().optional(),
      }).refine((b) => b.ids?.length || b.query, { message: 'Provide ids or query' }),
    },
  }, async (req, reply) => reply.send(await zoomOut(req.body)));

  // abstract_summarize — multi-level summary
  f.post('/memories/abstract', {
    schema: {
      body: z.object({
        query: z.string().min(1),
        levels: z.number().int().min(1).max(5).optional(),
        model: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send(await abstractSummarize(req.body)));

  // retirement_analysis — candidates for soft-deletion
  f.get('/memories/retirement-candidates', {
    schema: {
      querystring: AgentQ.extend({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        explain: z.coerce.boolean().optional(),
        model: z.string().optional(),
      }),
    },
  }, async (req, reply) =>
    reply.send(await retirementAnalysis({
      agent_id: req.query.agent_id,
      limit: req.query.limit,
      explain: req.query.explain,
      model: req.query.model,
    })));

  // resolve_conflict — detect and resolve contradictions between two memories
  f.post('/memories/resolve-conflict', {
    schema: {
      body: z.object({
        id_a: z.number().int(),
        id_b: z.number().int(),
        store: z.boolean().optional(),
        model: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => reply.send(await resolveConflict(req.body)));

  // quarantine — isolate a memory pending review
  f.post('/memories/:id/quarantine', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: AgentQ,
    },
  }, async (req, reply) => {
    const quarantined = quarantineMemory(req.params.id, req.query.agent_id ?? 'default');
    return reply.send({ quarantined });
  });

  // unquarantine — release from quarantine
  f.delete('/memories/:id/quarantine', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: AgentQ,
    },
  }, async (req, reply) => {
    const released = unquarantineMemory(req.params.id, req.query.agent_id ?? 'default');
    return reply.send({ released });
  });

  // list quarantined memories
  f.get('/memories/quarantined', {
    schema: {
      querystring: AgentQ.extend({ limit: z.coerce.number().int().min(1).max(200).optional() }),
    },
  }, async (req, reply) =>
    reply.send(listQuarantined(req.query.agent_id ?? 'default', req.query.limit)));

  // search_patterns — recurring themes across the memory store
  f.get('/memories/patterns', {
    schema: {
      querystring: AgentQ.extend({
        limit: z.coerce.number().int().min(1).max(50).optional(),
        min_count: z.coerce.number().int().min(1).optional(),
        model: z.string().optional(),
      }),
    },
  }, async (req, reply) =>
    reply.send(await searchPatterns({
      agent_id: req.query.agent_id,
      limit: req.query.limit,
      min_count: req.query.min_count,
      model: req.query.model,
    })));
}
