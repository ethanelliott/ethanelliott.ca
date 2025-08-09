import { FastifyInstance } from 'fastify';
import { CategoriesRouter } from './categories/categories.router';
import { MediumsRouter } from './mediums/mediums.router';
import { TagsRouter } from './tags/tags.router';
import { TransactionsRouter } from './transaction/transactions.router';

export async function FinancesRouter(fastify: FastifyInstance) {
  fastify.register(TransactionsRouter, { prefix: 'transactions' });
  fastify.register(MediumsRouter, { prefix: 'mediums' });
  fastify.register(CategoriesRouter, { prefix: 'categories' });
  fastify.register(TagsRouter, { prefix: 'tags' });
}
