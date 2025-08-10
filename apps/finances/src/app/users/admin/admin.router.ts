import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AdminService, WipeAllUsersResponseSchema } from './admin.service';

export async function AdminRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _adminService = inject(AdminService);

  /**
   * 🗑️ ADMIN: WIPE ALL USERS
   */
  typedFastify.delete(
    '/all',
    {
      schema: {
        tags: ['Admin'],
        description: 'Wipe all users (admin/testing only)',
        response: {
          200: WipeAllUsersResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await _adminService.wipeAllUsers();
      return reply.send(result);
    }
  );
}
