import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CategoriesService } from './categories.service';
import { Category, FullCategorySchema, SimpleCategorySchema } from './category';

export async function CategoriesRouter(fastify: FastifyInstance) {
  const _categoriesService = inject(CategoriesService);

  fastify.get(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Categories'],
        response: { 200: z.array(SimpleCategorySchema) },
      },
    },
    async function (request, reply) {
      const allCategories = await _categoriesService.all();
      return reply.send(allCategories);
    }
  );

  fastify.post(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Categories'],
        body: FullCategorySchema,
        response: { 200: FullCategorySchema },
      },
    },
    async function (request, reply) {
      const Category = request.body as Category;
      const newCategory = await _categoriesService.new(Category);
      return reply.send(newCategory);
    }
  );

  fastify.delete(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Categories'],
      },
    },
    async function (request, reply) {
      const deleted = await _categoriesService.deleteAll();
      return reply.send(deleted);
    }
  );

  fastify.get(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Categories'],
        response: { 200: FullCategorySchema },
      },
    },
    async function (request, reply) {
      const { name } = request.params as Record<string, string>;
      const category = await _categoriesService.get(name);
      return reply.send(category);
    }
  );

  fastify.put(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Categories'],
        params: z.object({
          name: z.string(),
        }),
        body: FullCategorySchema,
        response: { 200: FullCategorySchema },
      },
    },
    async function (request, reply) {
      const { name } = request.params as Record<string, string>;
      const category = await _categoriesService.update(
        name,
        request.body as Category
      );
      return reply.send(category);
    }
  );

  fastify.delete(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Categories'],
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async function (request, reply) {
      const { name } = request.params as Record<string, string>;
      const deleted = await _categoriesService.delete(name);
      return reply.send(deleted);
    }
  );
}
