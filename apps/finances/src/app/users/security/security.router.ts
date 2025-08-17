import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SecurityService } from './security.service';
import {
  DeletePasskeyResponseSchema,
  RevokeAllSessionsResponseSchema,
  PasskeyCredentialIdParamSchema,
} from './security.types';

export async function SecurityRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _securityService = inject(SecurityService);

  /**
   * 🗑️ DELETE PASSKEY
   */
  typedFastify.delete(
    '/passkey/:credentialId',
    {
      preHandler: [fastify.authenticate()],
      schema: {
        tags: ['Security'],
        description: 'Delete a specific passkey',
        params: PasskeyCredentialIdParamSchema,
        response: {
          200: DeletePasskeyResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;
      // request.params is now automatically typed based on PasskeyCredentialIdParamSchema
      const { credentialId } = request.params;

      const result = await _securityService.deletePasskey(userId, credentialId);
      return reply.send(result);
    }
  );

  /**
   * REVOKE ALL SESSIONS
   */
  typedFastify.post(
    '/revoke-all',
    {
      preHandler: [fastify.authenticate()],
      schema: {
        tags: ['Security'],
        description: 'Revoke all active sessions (except current)',
        response: {
          200: RevokeAllSessionsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;

      const result = await _securityService.revokeAllSessions(userId);
      return reply.send(result);
    }
  );
}
