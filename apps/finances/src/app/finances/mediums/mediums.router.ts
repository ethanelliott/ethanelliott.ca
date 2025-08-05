import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Medium, FullMediumSchema, SimpleMediumSchema } from './medium';
import { MediumsService } from './mediums.service';

export async function MediumsRouter(fastify: FastifyInstance) {
  const _mediumsService = inject(MediumsService);

  fastify.get(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
        response: { 200: z.array(SimpleMediumSchema) },
      },
    },
    async function (request, reply) {
      const allMediums = await _mediumsService.all();
      return reply.send(allMediums);
    }
  );

  fastify.post(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
        body: FullMediumSchema,
        response: { 200: FullMediumSchema },
      },
    },
    async function (request, reply) {
      const medium = request.body as Medium;
      const newMedium = await _mediumsService.new(medium);
      return reply.send(newMedium);
    }
  );

  fastify.delete(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
      },
    },
    async function (request, reply) {
      const deleted = await _mediumsService.deleteAll();
      return reply.send(deleted);
    }
  );

  fastify.get(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
        response: { 200: FullMediumSchema },
      },
    },
    async function (request, reply) {
      const { name } = request.params as Record<string, string>;
      const medium = await _mediumsService.get(name);
      return reply.send(medium);
    }
  );

  fastify.put(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
        params: z.object({
          name: z.string().uuid(),
        }),
        body: FullMediumSchema,
        response: { 200: FullMediumSchema },
      },
    },
    async function (request, reply) {
      const { name } = request.params as Record<string, string>;
      const medium = await _mediumsService.update(name, request.body as Medium);
      return reply.send(medium);
    }
  );

  fastify.delete(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
        params: z.object({
          name: z.string().uuid(),
        }),
      },
    },
    async function (request, reply) {
      const { name } = request.params as Record<string, string>;
      const deleted = await _mediumsService.delete(name);
      return reply.send(deleted);
    }
  );
}
