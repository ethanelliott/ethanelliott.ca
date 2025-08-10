import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TagsService } from './tags.service';
import { Tag, FullTag, FullTagSchema, SimpleTagSchema } from './tag';

export async function TagsRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _tagsService = inject(TagsService);

  typedFastify.get(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Tags'],
        response: { 200: z.array(SimpleTagSchema) },
      },
    },
    async function (request, reply) {
      const allTags = await _tagsService.all();
      return reply.send(allTags);
    }
  );

  typedFastify.post(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Tags'],
        body: FullTagSchema,
        response: { 200: FullTagSchema },
      },
    },
    async function (request, reply) {
      const tag = request.body;
      const newTag = await _tagsService.new(tag);
      return reply.send(newTag);
    }
  );

  typedFastify.get(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Tags'],
        params: z.object({
          name: z.string(),
        }),
        response: { 200: FullTagSchema },
      },
    },
    async function (request, reply) {
      // request.params is now automatically typed
      const { name } = request.params;
      const tag = await _tagsService.get(name);
      return reply.send(tag);
    }
  );

  typedFastify.put(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Tags'],
        params: z.object({
          name: z.string(),
        }),
        body: FullTagSchema,
        response: { 200: FullTagSchema },
      },
    },
    async function (request, reply) {
      const { name } = request.params;
      const tag = await _tagsService.update(name, request.body);
      return reply.send(tag);
    }
  );

  typedFastify.delete(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Tags'],
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async function (request, reply) {
      const { name } = request.params;
      const deleted = await _tagsService.delete(name);
      return reply.send(deleted);
    }
  );
}
