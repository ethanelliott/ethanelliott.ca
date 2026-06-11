import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UsersRouter } from './users/users.router';
import { SplitRouter } from './split/split.router';

// Import entity registrations so TypeORM knows about them.
import './users/user';
import './split';

export async function Application(fastify: FastifyInstance) {
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(UsersRouter, { prefix: '/users' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(SplitRouter, { prefix: '/split' });
}
