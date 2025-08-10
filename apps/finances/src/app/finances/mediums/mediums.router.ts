import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Medium, FullMediumSchema, SimpleMediumSchema } from './medium';
import { MediumsService } from './mediums.service';

export async function MediumsRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _mediumsService = inject(MediumsService);

  typedFastify.get(
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

  typedFastify.post(
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
      const medium = request.body;
      const newMedium = await _mediumsService.new(medium);
      return reply.send(newMedium);
    }
  );

  typedFastify.delete(
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

  typedFastify.get(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
        params: z.object({
          name: z.string(),
        }),
        response: { 200: FullMediumSchema },
      },
    },
    async function (request, reply) {
      // request.params is now automatically typed
      const { name } = request.params;
      const medium = await _mediumsService.get(name);
      return reply.send(medium);
    }
  );

  typedFastify.put(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
        params: z.object({
          name: z.string(),
        }),
        body: FullMediumSchema,
        response: { 200: FullMediumSchema },
      },
    },
    async function (request, reply) {
      // Both request.params and request.body are automatically typed
      const { name } = request.params;
      const medium = await _mediumsService.update(name, request.body);
      return reply.send(medium);
    }
  );

  typedFastify.delete(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Mediums'],
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async function (request, reply) {
      // request.params is now automatically typed
      const { name } = request.params;
      const deleted = await _mediumsService.delete(name);
      return reply.send(deleted);
    }
  );
}
