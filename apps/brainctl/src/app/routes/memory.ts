import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { addMemory, searchMemories, forgetMemory, getMemory, updateMemory, listMemories } from '../services/memory.service.js';
import { MemorySchema, ErrorSchema, DeletedSchema } from '../schemas.js';

export async function MemoryRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // List memories with optional filters and pagination
  f.get('/memories', {
    schema: {
      querystring: z.object({
        category: z.string().optional(),
        memory_type: z.string().optional(),
        scope: z.string().optional(),
        include_retired: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        agent_id: z.string().optional(),
      }),
      response: { 200: z.array(MemorySchema) },
    },
  }, async (req, reply) => reply.send(listMemories(req.query)));

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
    const id = await addMemory(req.body);
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
      response: {
        200: z.array(MemorySchema),
      },
    },
  }, async (req, reply) => {
    const results = await searchMemories({
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
      response: {
        200: MemorySchema,
        404: ErrorSchema,
      },
    },
  }, async (req, reply) => {
    const memory = getMemory(req.params.id, req.query.agent_id);
    if (!memory) return reply.status(404).send({ error: 'Memory not found' });
    return reply.send(memory);
  });

  f.patch('/memories/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      body: z.object({
        content: z.string().optional(),
        category: z.string().optional(),
        tags: z.union([z.string(), z.array(z.string())]).optional(),
        confidence: z.number().min(0).max(1).optional(),
        memory_type: z.enum(['episodic', 'semantic', 'procedural']).optional(),
        temporal_class: z.enum(['ephemeral', 'short', 'medium', 'long']).optional(),
        scope: z.string().optional(),
        agent_id: z.string().optional(),
      }),
    },
  }, async (req, reply) => {
    const updated = updateMemory(req.params.id, req.body);
    if (!updated) return reply.status(404).send({ error: 'Memory not found' });
    return reply.send({ updated });
  });

  f.delete('/memories/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int() }),
      querystring: z.object({ agent_id: z.string().optional() }),
      response: {
        200: DeletedSchema,
      },
    },
  }, async (req, reply) => {
    const deleted = forgetMemory(req.params.id, req.query.agent_id);
    return reply.send({ deleted });
  });
}
