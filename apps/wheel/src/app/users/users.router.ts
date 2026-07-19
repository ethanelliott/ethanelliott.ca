import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthRouter } from './auth/auth.router';
import { ProfileRouter } from './profile/profile.router';
import { PublicUserSchema } from './user';
import { UsersService } from './users.service';

export async function UsersRouter(fastify: FastifyInstance) {
  await fastify.register(AuthRouter);
  await fastify.register(ProfileRouter, { prefix: '/profile' });

  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _users = inject(UsersService);

  typedFastify.get(
    '/search',
    {
      preHandler: [fastify.authenticate()],
      schema: {
        tags: ['Users'],
        description:
          'Search for people by username or display name (for sharing wheels)',
        querystring: z.object({ q: z.string().min(1).max(50) }),
        response: { 200: z.array(PublicUserSchema) },
      },
    },
    async (request, reply) =>
      reply.send(
        await _users.search(request.query.q, request.currentUser.id)
      )
  );
}
