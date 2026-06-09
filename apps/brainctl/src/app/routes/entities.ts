import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createOrGetEntity,
  getEntity,
  searchEntities,
  relateEntities,
  getEntityRelations,
  updateEntity,
  deleteEntity,
} from '../services/entity.service.js';
import { EntitySchema, ErrorSchema } from '../schemas.js';

export async function EntityRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post('/entities', {
    schema: {
      body: z.object({
        name: z.string().min(1),
        entity_type: z.string().optional(),
        properties: z.record(z.unknown()).optional(),
        observations: z.array(z.string()).optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        201: z.object({ id: z.number() }),
      },
    },
  }, async (req, reply) => {
    const id = await createOrGetEntity(req.body);
    return reply.status(201).send({ id });
  });

  f.get('/entities/search', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        entity_type: z.string().optional(),
        agent_id: z.string().optional(),
      }),
      response: {
        200: z.array(EntitySchema),
      },
    },
  }, async (req, reply) => {
    const results = searchEntities({
      query: req.query.q,
      limit: req.query.limit,
      entity_type: req.query.entity_type,
      agent_id: req.query.agent_id,
    });
    return reply.send(results);
  });

  f.get('/entities/:name', {
    schema: {
      params: z.object({ name: z.string() }),
      querystring: z.object({ agent_id: z.string().optional() }),
      response: {
        200: EntitySchema,
        404: ErrorSchema,
      },
    },
  }, async (req, reply) => {
    const entity = getEntity(req.params.name, req.query.agent_id);
    if (!entity) return reply.status(404).send({ error: 'Entity not found' });
    return reply.send(entity);
  });

  f.get('/entities/:name/relations', {
    schema: {
      params: z.object({ name: z.string() }),
      querystring: z.object({ agent_id: z.string().optional() }),
    },
  }, async (req, reply) => {
    const relations = getEntityRelations(req.params.name, req.query.agent_id);
    return reply.send(relations);
  });

  f.patch('/entities/:name', {
    schema: {
      params: z.object({ name: z.string() }),
      body: z.object({
        entity_type: z.string().optional(),
        properties: z.record(z.unknown()).optional(),
        observations: z.array(z.string()).optional(),
        compiled_truth: z.string().optional(),
        agent_id: z.string().optional(),
      }),
      response: { 200: z.object({ updated: z.boolean() }), 404: ErrorSchema },
    },
  }, async (req, reply) => {
    const updated = await updateEntity(req.params.name, req.body);
    if (!updated) return reply.status(404).send({ error: 'Entity not found' });
    return reply.send({ updated });
  });

  f.delete('/entities/:name', {
    schema: {
      params: z.object({ name: z.string() }),
      querystring: z.object({ agent_id: z.string().optional() }),
      response: { 200: z.object({ deleted: z.boolean() }), 404: ErrorSchema },
    },
  }, async (req, reply) => {
    const deleted = deleteEntity(req.params.name, req.query.agent_id ?? 'default');
    if (!deleted) return reply.status(404).send({ error: 'Entity not found' });
    return reply.send({ deleted });
  });

  f.post('/entities/relate', {
    schema: {
      body: z.object({
        from: z.string().min(1),
        relation: z.string().min(1),
        to: z.string().min(1),
        agent_id: z.string().optional(),
      }),
      response: {
        200: z.object({ ok: z.boolean() }),
      },
    },
  }, async (req, reply) => {
    relateEntities(req.body.from, req.body.relation, req.body.to, req.body.agent_id);
    return reply.send({ ok: true });
  });
}
