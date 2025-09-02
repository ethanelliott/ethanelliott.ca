import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

export interface BeforeHandler {
  (
    req: FastifyRequest,
    reply: FastifyReply,
    next: HookHandlerDoneFunction
  ): Promise<unknown> | void;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(): BeforeHandler;
  }
}

export const JWTPlugin = fp(async function (fastify: FastifyInstance) {
  // Register JWT plugin
  await fastify.register(jwt, {
    secret:
      process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production',
    sign: {
      algorithm: 'HS256',
      expiresIn: '30s', // Short-lived access tokens for testing - normally '15m'
    },
    verify: {
      algorithms: ['HS256'],
    },
  });

  // Add JWT verification decorator
  fastify.decorate(
    'authenticate',
    () =>
      async function (request: any, reply: any) {
        try {
          // Only check for Bearer token in Authorization header
          const authHeader = request.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = fastify.jwt.verify(token) as any;
            request.currentUser = decoded;
            return;
          }

          throw new Error('No valid token found');
        } catch (err) {
          console.error('JWT authentication failed:', err);
          reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid or missing authentication token',
          });
        }
      }
  );

  // Add optional JWT verification decorator
  fastify.decorate(
    'optionalAuthenticate',
    async function (request: any, reply: any) {
      try {
        // Try to authenticate, but don't throw if it fails
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const decoded = fastify.jwt.verify(token) as any;
          request.currentUser = decoded;
          return;
        }

        // No token found, but that's okay for optional auth
        request.user = null;
      } catch (err) {
        // Token exists but is invalid/expired
        request.user = null;
      }
    }
  );

  // Helper to sign tokens
  fastify.decorate('signToken', function (payload: any, options?: any) {
    return fastify.jwt.sign(payload, options);
  });
});
