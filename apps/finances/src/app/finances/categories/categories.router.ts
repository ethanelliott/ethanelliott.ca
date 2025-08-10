import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CategoriesService } from './categories.service';
import { Category, FullCategorySchema, SimpleCategorySchema } from './category';

export async function CategoriesRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _categoriesService = inject(CategoriesService);

  typedFastify.get(
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

  typedFastify.post(
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
      const Category = request.body;
      const newCategory = await _categoriesService.new(Category);
      return reply.send(newCategory);
    }
  );

  typedFastify.delete(
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

  typedFastify.get(
    '/:name',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        tags: ['Categories'],
        params: z.object({
          name: z.string(),
        }),
        response: { 200: FullCategorySchema },
      },
    },
    async function (request, reply) {
      const { name } = request.params;
      const category = await _categoriesService.get(name);
      return reply.send(category);
    }
  );

  typedFastify.put(
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
      const { name } = request.params;
      const category = await _categoriesService.update(name, request.body);
      return reply.send(category);
    }
  );

  typedFastify.delete(
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
      const { name } = request.params;
      const deleted = await _categoriesService.delete(name);
      return reply.send(deleted);
    }
  );
}
