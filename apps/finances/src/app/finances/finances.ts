import { FastifyInstance } from 'fastify';
import { AccountsRouter } from './accounts/accounts.router';
import { CategoriesRouter } from './categories/categories.router';
import { TagsRouter } from './tags/tags.router';
import { TransactionsRouter } from './transaction/transactions.router';
import { TransfersRouter } from './transfers/transfers.router';

export async function FinancesRouter(fastify: FastifyInstance) {
  // Core financial entities
  fastify.register(AccountsRouter, { prefix: 'accounts' });
  fastify.register(TransactionsRouter, { prefix: 'transactions' });
  fastify.register(TransfersRouter, { prefix: 'transfers' });

  // Supporting entities
  fastify.register(CategoriesRouter, { prefix: 'categories' });
  fastify.register(TagsRouter, { prefix: 'tags' });
}
