import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TagsService } from './tags.service';
import { Tag, FullTag, FullTagSchema, SimpleTagSchema } from './tag';

export async function TagsRouter(fastify: FastifyInstance) {
  const _tagsService = inject(TagsService);

  fastify.get(
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

  fastify.post(
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
      const tag = request.body as Tag;
      const newTag = await _tagsService.new(tag);
      return reply.send(newTag);
    }
  );

  fastify.get(
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
      const { name } = request.params as Record<string, string>;
      const tag = await _tagsService.get(name);
      return reply.send(tag);
    }
  );

  fastify.put(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Tags'],
        params: z.object({
          name: z.string(),
        }),
        body: FullTagSchema,
      },
    },
    async function (request, reply) {
      const { name } = request.params as Record<string, string>;
      const tag = await _tagsService.update(name, request.body as Tag);
      return reply.send(tag);
    }
  );

  fastify.delete(
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
      const { name } = request.params as Record<string, string>;
      const deleted = await _tagsService.delete(name);
      return reply.send(deleted);
    }
  );
}
