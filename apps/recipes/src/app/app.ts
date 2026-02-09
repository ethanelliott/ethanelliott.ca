import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RecipesRouter } from './recipes/recipes.router';
import { CategoriesRouter } from './categories/categories.router';
import { TagsRouter } from './tags/tags.router';
import { GroceryListRouter } from './grocery-list/grocery-list.router';
import { AiRouter } from './ai/ai.router';

// Import entities to register them
import './recipes';
import './categories';
import './tags';

export async function Application(fastify: FastifyInstance) {
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(RecipesRouter, { prefix: '/recipes' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(CategoriesRouter, { prefix: '/categories' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(TagsRouter, { prefix: '/tags' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(GroceryListRouter, { prefix: '/grocery-list' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(AiRouter, { prefix: '/ai' });
}
