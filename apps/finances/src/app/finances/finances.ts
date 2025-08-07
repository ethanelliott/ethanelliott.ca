import { FastifyInstance } from 'fastify';
import { TransactionsRouter } from './transaction/transactions.router';
import { MediumsRouter } from './mediums/mediums.router';
import { CategoriesRouter } from './categories/categories.router';
import { TagsRouter } from './tags/tags.router';
import { UsersRouter } from './users/users.router';

export async function FinancesRouter(fastify: FastifyInstance) {
  fastify.register(UsersRouter, { prefix: 'users' });
  fastify.register(TransactionsRouter, { prefix: 'transactions' });
  fastify.register(MediumsRouter, { prefix: 'mediums' });
  fastify.register(CategoriesRouter, { prefix: 'categories' });
  fastify.register(TagsRouter, { prefix: 'tags' });
}
