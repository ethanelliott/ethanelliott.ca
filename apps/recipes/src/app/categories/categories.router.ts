import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CategoriesService } from './categories.service';
import { CategoryInSchema, CategoryOutSchema } from './category.entity';

export async function CategoriesRouter(fastify: FastifyInstance) {
  const categoriesService = inject(CategoriesService);

  // Get all categories
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        response: {
          200: z.array(CategoryOutSchema),
        },
      },
    },
    async () => {
      return categoriesService.getAll();
    }
  );

  // Create a category
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/',
    {
      schema: {
        body: CategoryInSchema,
        response: {
          201: CategoryOutSchema,
        },
      },
    },
    async (request, reply) => {
      const category = await categoriesService.create(request.body);
      reply.code(201);
      return category;
    }
  );

  // Get a specific category
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:categoryId',
    {
      schema: {
        params: z.object({
          categoryId: z.string().uuid(),
        }),
        response: {
          200: CategoryOutSchema,
        },
      },
    },
    async (request) => {
      return categoriesService.getById(request.params.categoryId);
    }
  );

  // Update a category
  fastify.withTypeProvider<ZodTypeProvider>().patch(
    '/:categoryId',
    {
      schema: {
        params: z.object({
          categoryId: z.string().uuid(),
        }),
        body: CategoryInSchema.partial(),
        response: {
          200: CategoryOutSchema,
        },
      },
    },
    async (request) => {
      return categoriesService.update(request.params.categoryId, request.body);
    }
  );

  // Delete a category
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    '/:categoryId',
    {
      schema: {
        params: z.object({
          categoryId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      await categoriesService.delete(request.params.categoryId);
      return { success: true };
    }
  );
}
