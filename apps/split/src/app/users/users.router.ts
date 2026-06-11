import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthRouter } from './auth/auth.router';
import { ProfileRouter } from './profile/profile.router';
import { PublicUserSchema } from './user';
import { UsersService } from './users.service';

export async function UsersRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _usersService = inject(UsersService);

  await fastify.register(AuthRouter);
  await fastify.register(ProfileRouter, { prefix: '/profile' });

  /**
   * 🔎 SEARCH USERS - find people to add to a group
   */
  typedFastify.get(
    '/search',
    {
      preHandler: [fastify.authenticate()],
      schema: {
        tags: ['Users'],
        description: 'Search users by username or name',
        querystring: z.object({ q: z.string().min(1) }),
        response: { 200: z.array(PublicUserSchema) },
      },
    },
    async (request, reply) => {
      const result = await _usersService.search(
        request.query.q,
        request.currentUser.id
      );
      return reply.send(result);
    }
  );
}
