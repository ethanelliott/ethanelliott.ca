import { FastifyInstance } from 'fastify';
import { FinancesRouter } from './plaid/finances.router';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UsersRouter } from './users/users.router';

// Import plaid entities to register them
import './plaid';

export async function Application(fastify: FastifyInstance) {
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(FinancesRouter, { prefix: '/finances' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(UsersRouter, { prefix: '/users' });
}
