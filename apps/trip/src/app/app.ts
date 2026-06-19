import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UsersRouter } from './users/users.router';
import { TripRouter } from './trip/trip.router';
import { ActivityRouter } from './activity/activity.router';
import { ExpenseRouter } from './expense/expense.router';

// Import entity registrations so TypeORM knows about them.
import './users/user';
import './trip';
import './activity';
import './expense';

export async function Application(fastify: FastifyInstance) {
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(UsersRouter, { prefix: '/users' });

  fastify.withTypeProvider<ZodTypeProvider>().register(TripRouter);
  fastify.withTypeProvider<ZodTypeProvider>().register(ActivityRouter);
  fastify.withTypeProvider<ZodTypeProvider>().register(ExpenseRouter);
}
