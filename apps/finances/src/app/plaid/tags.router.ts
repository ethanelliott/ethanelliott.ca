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
    async (request) => {
      return tagsService.getAll(request.currentUser.id);
    }
  );

  // Get tag usage stats
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/usage',
    {
      schema: {
        response: {
          200: z.array(
            z.object({
              tagId: z.string().uuid(),
              name: z.string(),
              transactionCount: z.number(),
            })
          ),
        },
      },
    },
    async (request) => {
      return tagsService.getUsageStats(request.currentUser.id);
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
      const tag = await tagsService.create(
        request.body,
        request.currentUser.id
      );
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
      return tagsService.getById(request.params.tagId, request.currentUser.id);
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
      return tagsService.update(
        request.params.tagId,
        request.body,
        request.currentUser.id
      );
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
      await tagsService.delete(request.params.tagId, request.currentUser.id);
      return { success: true };
    }
  );
}
