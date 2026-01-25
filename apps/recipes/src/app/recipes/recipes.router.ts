import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RecipesService } from './recipes.service';
import {
  RecipeInSchema,
  RecipeOutSchema,
  RecipeSummarySchema,
} from './recipe.entity';
import { IngredientOutSchema } from './ingredient.entity';
import { RecipePhotoOutSchema } from './recipe-photo.entity';

export async function RecipesRouter(fastify: FastifyInstance) {
  const recipesService = inject(RecipesService);

  // Get all recipes (summary view)
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        querystring: z.object({
          search: z.string().optional(),
          categoryIds: z
            .string()
            .optional()
            .transform((s) => (s ? s.split(',') : undefined)),
          tagIds: z
            .string()
            .optional()
            .transform((s) => (s ? s.split(',') : undefined)),
        }),
        response: {
          200: z.array(RecipeSummarySchema),
        },
      },
    },
    async (request) => {
      return recipesService.getAll({
        search: request.query.search,
        categoryIds: request.query.categoryIds,
        tagIds: request.query.tagIds,
      });
    }
  );

  // Get a random recipe
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/random',
    {
      schema: {
        querystring: z.object({
          categoryIds: z
            .string()
            .optional()
            .transform((s) => (s ? s.split(',') : undefined)),
          tagIds: z
            .string()
            .optional()
            .transform((s) => (s ? s.split(',') : undefined)),
        }),
        response: {
          200: RecipeOutSchema.nullable(),
        },
      },
    },
    async (request) => {
      return recipesService.getRandom({
        categoryIds: request.query.categoryIds,
        tagIds: request.query.tagIds,
      });
    }
  );

  // Create a recipe
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/',
    {
      schema: {
        body: RecipeInSchema,
        response: {
          201: RecipeOutSchema,
        },
      },
    },
    async (request, reply) => {
      const recipe = await recipesService.create(request.body);
      reply.code(201);
      return recipe;
    }
  );

  // Get a specific recipe
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:recipeId',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        response: {
          200: RecipeOutSchema,
        },
      },
    },
    async (request) => {
      return recipesService.getById(request.params.recipeId);
    }
  );

  // Update a recipe
  fastify.withTypeProvider<ZodTypeProvider>().patch(
    '/:recipeId',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        body: RecipeInSchema.partial(),
        response: {
          200: RecipeOutSchema,
        },
      },
    },
    async (request) => {
      return recipesService.update(request.params.recipeId, request.body);
    }
  );

  // Delete a recipe
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    '/:recipeId',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      await recipesService.delete(request.params.recipeId);
      return { success: true };
    }
  );

  // Get scaled ingredients
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:recipeId/scaled-ingredients',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        querystring: z.object({
          servings: z.coerce.number().positive(),
        }),
        response: {
          200: z.array(IngredientOutSchema),
        },
      },
    },
    async (request) => {
      return recipesService.getScaledIngredients(
        request.params.recipeId,
        request.query.servings
      );
    }
  );

  // Upload a photo to a recipe (base64 encoded)
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/:recipeId/photos',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        body: z.object({
          filename: z.string(),
          mimeType: z.string(),
          data: z.string(), // base64 encoded
        }),
        response: {
          201: RecipePhotoOutSchema,
        },
      },
    },
    async (request, reply) => {
      const buffer = Buffer.from(request.body.data, 'base64');
      const photo = await recipesService.addPhoto(
        request.params.recipeId,
        request.body.filename,
        request.body.mimeType,
        buffer
      );

      reply.code(201);
      return photo;
    }
  );

  // Get photo data (returns the actual image)
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/photos/:photoId',
    {
      schema: {
        params: z.object({
          photoId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { data, mimeType, filename } = await recipesService.getPhotoData(
        request.params.photoId
      );

      reply.header('Content-Type', mimeType);
      reply.header('Content-Disposition', `inline; filename="${filename}"`);
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      return reply.send(data);
    }
  );

  // Delete a photo
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    '/photos/:photoId',
    {
      schema: {
        params: z.object({
          photoId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      await recipesService.deletePhoto(request.params.photoId);
      return { success: true };
    }
  );
}
