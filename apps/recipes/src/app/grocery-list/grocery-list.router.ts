import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { GroceryListService, GroceryListSchema } from './grocery-list.service';

export async function GroceryListRouter(fastify: FastifyInstance) {
  const groceryListService = inject(GroceryListService);

  // Generate a grocery list from selected recipes
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/generate',
    {
      schema: {
        body: z.object({
          recipes: z.array(
            z.object({
              recipeId: z.string().uuid(),
              servings: z.number().positive(),
            })
          ),
        }),
        response: {
          200: GroceryListSchema,
        },
      },
    },
    async (request) => {
      return groceryListService.generate(request.body);
    }
  );
}
