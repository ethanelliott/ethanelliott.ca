import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { computePageRank, whosKnows, traverse } from '../services/graph.service.js';
import {
  listEdges, setEdgeWeight, createEdge, deleteEdge,
  linkEvent, getEventLinks,
  createEpoch, closeEpoch, listEpochs, getEpochMemories,
} from '../services/graph.edges.service.js';

export async function GraphRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // PageRank over the knowledge graph for this agent
  f.get('/graph/pagerank', {
    schema: {
      querystring: z.object({
        agent_id: z.string().optional(),
        iterations: z.coerce.number().int().min(1).max(100).optional(),
        damping: z.coerce.number().min(0).max(1).optional(),
        top_k: z.coerce.number().int().min(1).max(200).optional(),
      }),
    },
  }, async (req, reply) => {
    const nodes = computePageRank(
      req.query.agent_id ?? 'default',
      req.query.iterations,
      req.query.damping,
      req.query.top_k,
    );
    return reply.send(nodes);
  });

  // Which entities have the most knowledge touching a topic?
  f.get('/graph/whosknows', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        agent_id: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    },
  }, async (req, reply) => {
    const results = await whosKnows(req.query.q, req.query.agent_id ?? 'default', req.query.limit);
    return reply.send(results);
  });

  // Multi-hop traversal from a starting node
  f.get('/graph/traverse', {
    schema: {
      querystring: z.object({
        type: z.enum(['memory', 'entity']),
        id: z.coerce.number().int(),
        agent_id: z.string().optional(),
        depth: z.coerce.number().int().min(1).max(6).optional(),
        max_nodes: z.coerce.number().int().min(1).max(200).optional(),
      }),
    },
  }, async (req, reply) => {
    const nodes = traverse(
      req.query.type,
      req.query.id,
      req.query.agent_id ?? 'default',
      req.query.depth,
      req.query.max_nodes,
    );
    return reply.send(nodes);
  });

  // ---- edge weights ----

  f.get('/graph/edges', {
    schema: {
      querystring: z.object({
        from_type: z.string().optional(),
        from_id: z.coerce.number().int().optional(),
        to_type: z.string().optional(),
        to_id: z.coerce.number().int().optional(),
        relation: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      }),
    },
  }, async (req, reply) => reply.send(listEdges(req.query)));

  f.post('/graph/edges', {
    schema: {
      body: z.object({
        from_type: z.string().min(1),
        from_id: z.number().int(),
        relation: z.string().min(1),
        to_type: z.string().min(1),
        to_id: z.number().int(),
        weight: z.number().min(0).max(10).optional(),
      }),
    },
  }, async (req, reply) => reply.status(201).send({ id: createEdge(req.body) }));

  f.patch('/graph/edges/:id/weight', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      body: z.object({ weight: z.number().min(0).max(10) }),
    },
  }, async (req, reply) => {
    const updated = setEdgeWeight(req.params.id, req.body.weight);
    return reply.send({ updated });
  });

  f.delete('/graph/edges/:id', {
    schema: { params: z.object({ id: z.coerce.number().int() }) },
  }, async (req, reply) => reply.send({ deleted: deleteEdge(req.params.id) }));

  // ---- event_link ----

  f.post('/graph/events/:id/link', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      body: z.object({
        targets: z.array(z.object({
          type: z.enum(['memory', 'entity']),
          id: z.number().int(),
          relation: z.string().optional(),
        })).min(1).max(100),
        weight: z.number().min(0).max(10).optional(),
      }),
    },
  }, async (req, reply) => {
    const ids = linkEvent({ event_id: req.params.id, ...req.body });
    return reply.status(201).send({ edge_ids: ids });
  });

  f.get('/graph/events/:id/links', {
    schema: { params: z.object({ id: z.coerce.number().int() }) },
  }, async (req, reply) => reply.send(getEventLinks(req.params.id)));

  // ---- epochs ----

  f.put('/graph/epochs/:label', {
    schema: {
      params: z.object({ label: z.string().min(1) }),
      body: z.object({
        starts_at: z.string().min(1),
        ends_at: z.string().optional(),
        description: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) =>
    reply.status(201).send({ id: createEpoch({ label: req.params.label, ...req.body }) }));

  f.post('/graph/epochs/:label/close', {
    schema: {
      params: z.object({ label: z.string().min(1) }),
      body: z.object({ ends_at: z.string().optional(), agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const closed = closeEpoch(req.params.label, req.body.agent_id ?? 'default', req.body.ends_at);
    return reply.send({ closed });
  });

  f.get('/graph/epochs', {
    schema: { querystring: z.object({ agent_id: z.string().optional() }) },
  }, async (req, reply) => reply.send(listEpochs(req.query.agent_id ?? 'default')));

  f.get('/graph/epochs/:label/memories', {
    schema: {
      params: z.object({ label: z.string().min(1) }),
      querystring: z.object({
        agent_id: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      }),
    },
  }, async (req, reply) => {
    const result = getEpochMemories(req.params.label, req.query.agent_id ?? 'default', req.query.limit);
    if (!result.epoch) return reply.status(404).send({ error: 'Epoch not found' });
    return reply.send(result);
  });
}
