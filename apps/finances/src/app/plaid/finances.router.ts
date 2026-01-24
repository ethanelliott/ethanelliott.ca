import { FastifyInstance } from 'fastify';
import { PlaidRouter } from './plaid.router';
import { AccountsRouter } from './accounts.router';
import { TransactionsRouter } from './transactions.router';
import { CategoriesRouter } from './categories.router';
import { TagsRouter } from './tags.router';
import { OverviewRouter } from './overview.router';

export async function FinancesRouter(fastify: FastifyInstance) {
  // Apply authentication to all routes in this router
  fastify.addHook('preHandler', fastify.authenticate());

  // Plaid integration (connecting banks, syncing)
  fastify.register(PlaidRouter, { prefix: 'plaid' });

  // Core financial data
  fastify.register(AccountsRouter, { prefix: 'accounts' });
  fastify.register(TransactionsRouter, { prefix: 'transactions' });

  // Analytics and overview
  fastify.register(OverviewRouter, { prefix: 'overview' });

  // Supporting entities
  fastify.register(CategoriesRouter, { prefix: 'categories' });
  fastify.register(TagsRouter, { prefix: 'tags' });
}
