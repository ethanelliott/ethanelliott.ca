import { FastifyInstance } from 'fastify';
import { AuthRouter } from './auth/auth.router';
import { ProfileRouter } from './profile/profile.router';

export async function UsersRouter(fastify: FastifyInstance) {
  await fastify.register(AuthRouter);
  await fastify.register(ProfileRouter, { prefix: '/profile' });
}
