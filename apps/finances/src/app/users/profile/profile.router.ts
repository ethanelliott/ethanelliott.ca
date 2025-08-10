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

  /**
   * 📊 GET USER PROFILE
   */
  typedFastify.get(
    '/',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['User Profile'],
        description: 'Get current user profile with security information',
        response: {
          200: ProfileResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;
      const result = await _profileService.getProfile(userId);
      return reply.send(result);
    }
  );

  /**
   * ✏️ UPDATE PROFILE
   */
  typedFastify.put(
    '/',
    {
      preHandler: [(fastify as any).authenticate],
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
      const userId = (request as any).user.userId;
      const updates = request.body;
      const result = await _profileService.updateProfile(userId, updates);
      return reply.send(result);
    }
  );

  /**
   * ❌ DELETE ACCOUNT
   */
  typedFastify.delete(
    '/',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['User Profile'],
        description: 'Delete user account (irreversible)',
        response: {
          200: DeleteAccountResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;

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
