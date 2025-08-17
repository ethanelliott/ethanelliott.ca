import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CategoriesService } from './categories.service';
import {
  Category,
  FullCategorySchema,
  SimpleCategorySchema,
  CategoryOutSchema,
} from './category';

export async function CategoriesRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _categoriesService = inject(CategoriesService);

  typedFastify.get(
    '/',
    {
      preHandler: [(fastify as any).authenticate, fastify.circuitBreaker()],
      schema: {
        tags: ['Categories'],
        description: 'Get all categories',
        response: { 200: z.array(SimpleCategorySchema) },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const allCategories = await _categoriesService.all(userId);
      return reply.send(allCategories);
    }
  );

  typedFastify.post(
    '/',
    {
      preHandler: [(fastify as any).authenticate, fastify.circuitBreaker()],
      schema: {
        tags: ['Categories'],
        description: 'Create new category',
        body: FullCategorySchema,
        response: { 200: CategoryOutSchema },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const category = request.body;
      const newCategory = await _categoriesService.new(category, userId);
      return reply.send(newCategory);
    }
  );

  typedFastify.delete(
    '/',
    {
      preHandler: [(fastify as any).authenticate, fastify.circuitBreaker()],
      schema: {
        tags: ['Categories'],
        description: 'Delete all categories',
        response: {
          200: z.object({
            deletedCount: z.number(),
          }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const deleted = await _categoriesService.deleteAll(userId);
      return reply.send(deleted);
    }
  );

  typedFastify.get(
    '/:name',
    {
      preHandler: [(fastify as any).authenticate, fastify.circuitBreaker()],
      schema: {
        tags: ['Categories'],
        description: 'Get category by name',
        params: z.object({
          name: z.string(),
        }),
        response: {
          200: CategoryOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { name } = request.params;
      try {
        const category = await _categoriesService.get(name, userId);
        return reply.send(category);
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
      preHandler: [(fastify as any).authenticate, fastify.circuitBreaker()],
      schema: {
        tags: ['Categories'],
        description: 'Update category',
        params: z.object({
          name: z.string(),
        }),
        body: FullCategorySchema,
        response: {
          200: CategoryOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { name } = request.params;
      try {
        const category = await _categoriesService.update(
          name,
          request.body,
          userId
        );
        return reply.send(category);
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
      preHandler: [(fastify as any).authenticate, fastify.circuitBreaker()],
      schema: {
        tags: ['Categories'],
        description: 'Delete category',
        params: z.object({
          name: z.string(),
        }),
        response: {
          200: CategoryOutSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async function (request, reply) {
      const userId = request.currentUser.id;
      const { name } = request.params;
      try {
        const deleted = await _categoriesService.delete(name, userId);
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
