import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { FullTagSchema, SimpleTagSchema, TagOutSchema } from './tag';
import { TagsService } from './tags.service';

export async function TagsRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _tagsService = inject(TagsService);

  typedFastify.get(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Tags'],
        description: 'Get all tags',
        response: { 200: z.array(SimpleTagSchema) },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const allTags = await _tagsService.all(userId);
      return reply.send(allTags);
    }
  );

  typedFastify.post(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Tags'],
        description: 'Create new tag',
        body: FullTagSchema,
        response: { 200: TagOutSchema },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const tag = request.body;
      const newTag = await _tagsService.new(tag, userId);
      return reply.send(newTag);
    }
  );

  typedFastify.delete(
    '/',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Tags'],
        description: 'Delete all tags',
        response: {
          200: z.object({
            deletedCount: z.number(),
          }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const deleted = await _tagsService.deleteAll(userId);
      return reply.send(deleted);
    }
  );

  typedFastify.get(
    '/:name',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Tags'],
        description: 'Get tag by name',
        params: z.object({
          name: z.string(),
        }),
        response: {
          200: TagOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { name } = request.params;
      try {
        const tag = await _tagsService.get(name, userId);
        return reply.send(tag);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  typedFastify.put(
    '/:name',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Tags'],
        description: 'Update tag',
        params: z.object({
          name: z.string(),
        }),
        body: FullTagSchema,
        response: {
          200: TagOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { name } = request.params;
      try {
        const tag = await _tagsService.update(name, request.body, userId);
        return reply.send(tag);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  typedFastify.delete(
    '/:name',
    {
      preHandler: [fastify.authenticate(), fastify.circuitBreaker()],
      schema: {
        tags: ['Tags'],
        description: 'Delete tag',
        params: z.object({
          name: z.string(),
        }),
        response: {
          200: TagOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { name } = request.params;
      try {
        const deleted = await _tagsService.delete(name, userId);
        return reply.send(deleted);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ message: error.message });
        }
        throw error;
      }
    }
  );
}
