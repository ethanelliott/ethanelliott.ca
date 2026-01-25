import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TagsService } from './tags.service';
import { TagInSchema, TagOutSchema } from './tag.entity';

export async function TagsRouter(fastify: FastifyInstance) {
  const tagsService = inject(TagsService);

  // Get all tags
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        response: {
          200: z.array(TagOutSchema),
        },
      },
    },
    async () => {
      return tagsService.getAll();
    }
  );

  // Create a tag
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/',
    {
      schema: {
        body: TagInSchema,
        response: {
          201: TagOutSchema,
        },
      },
    },
    async (request, reply) => {
      const tag = await tagsService.create(request.body);
      reply.code(201);
      return tag;
    }
  );

  // Get a specific tag
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:tagId',
    {
      schema: {
        params: z.object({
          tagId: z.string().uuid(),
        }),
        response: {
          200: TagOutSchema,
        },
      },
    },
    async (request) => {
      return tagsService.getById(request.params.tagId);
    }
  );

  // Update a tag
  fastify.withTypeProvider<ZodTypeProvider>().patch(
    '/:tagId',
    {
      schema: {
        params: z.object({
          tagId: z.string().uuid(),
        }),
        body: TagInSchema.partial(),
        response: {
          200: TagOutSchema,
        },
      },
    },
    async (request) => {
      return tagsService.update(request.params.tagId, request.body);
    }
  );

  // Delete a tag
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    '/:tagId',
    {
      schema: {
        params: z.object({
          tagId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      await tagsService.delete(request.params.tagId);
      return { success: true };
    }
  );
}
