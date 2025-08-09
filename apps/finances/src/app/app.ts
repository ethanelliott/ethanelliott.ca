import { FastifyInstance } from 'fastify';
import { FinancesRouter } from './finances/finances';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UsersRouter } from './users/users.router';

export async function Application(fastify: FastifyInstance) {
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(FinancesRouter, { prefix: '/finances' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(UsersRouter, { prefix: '/users' });
}
