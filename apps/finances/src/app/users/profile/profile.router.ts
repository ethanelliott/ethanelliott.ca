import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ProfileService } from './profile.service';
import {
  ProfileResponseSchema,
  UpdateProfileRequestSchema,
  UpdateProfileResponseSchema,
  DeleteAccountResponseSchema,
} from './profile.types';

export async function ProfileRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _profileService = inject(ProfileService);

  typedFastify.get(
    '/',
    {
      preHandler: [fastify.authenticate()],
      schema: {
        tags: ['User Profile'],
        description: 'Get current user profile with security information',
        response: {
          200: ProfileResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.currentUser.id;
      const result = await _profileService.getProfile(userId);
      return reply.send(result);
    }
  );

  typedFastify.put(
    '/',
    {
      preHandler: [fastify.authenticate()],
      schema: {
        tags: ['User Profile'],
        description: 'Update user profile information',
        body: UpdateProfileRequestSchema,
        response: {
          200: UpdateProfileResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.currentUser.id;
      const updates = request.body;
      const result = await _profileService.updateProfile(userId, updates);
      return reply.send(result);
    }
  );

  typedFastify.delete(
    '/',
    {
      preHandler: [fastify.authenticate()],
      schema: {
        tags: ['User Profile'],
        description: 'Delete user account (irreversible)',
        response: {
          200: DeleteAccountResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.currentUser.id;

      try {
        const result = await _profileService.deleteAccount(userId);
        return reply.send(result);
      } catch (error) {
        throw fastify.httpErrors.internalServerError(
          error instanceof Error ? error.message : 'Failed to delete account'
        );
      }
    }
  );
}
