import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { addMemory, searchMemories, forgetMemory, getMemory } from '../services/memory.service.js';

export async function MemoryRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post('/memories', {
    schema: {
      body: z.object({
        content: z.string().min(1),
        category: z.string().optional(),
        tags: z.union([z.string(), z.array(z.string())]).optional(),
        confidence: z.number().min(0).max(1).optional(),
        memory_type: z.enum(['episodic', 'semantic', 'procedural']).optional(),
        scope: z.string().optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        201: z.object({ id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const id = addMemory(req.body);
    return reply.status(201).send({ id });
  });

  f.get('/memories/search', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        memory_type: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const results = searchMemories({
      query: req.query.q,
      limit: req.query.limit,
      memory_type: req.query.memory_type,
      agent_id: req.query.agent_id,
    });
    return reply.send(results);
  });

  f.get('/memories/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const memory = getMemory(req.params.id, req.query.agent_id);
    if (!memory) return reply.status(404).send({ error: 'Memory not found' });
    return reply.send(memory);
  });

  f.delete('/memories/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
      response: {
        200: z.object({ deleted: z.boolean() }),
      },
    },
  }, async (req, reply) => {
    const deleted = forgetMemory(req.params.id, req.query.agent_id);
    return reply.send({ deleted });
  });
}
