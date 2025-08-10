import { FastifyInstance } from 'fastify';
import { AuthRouter } from './auth/auth.router';
import { ProfileRouter } from './profile/profile.router';
import { SecurityRouter } from './security/security.router';
import { AdminRouter } from './admin/admin.router';

export async function UsersRouter(fastify: FastifyInstance) {
  await fastify.register(AuthRouter);
  await fastify.register(ProfileRouter, { prefix: '/profile' });
  await fastify.register(SecurityRouter, { prefix: '/security' });
  await fastify.register(AdminRouter, { prefix: '/admin' });
}
