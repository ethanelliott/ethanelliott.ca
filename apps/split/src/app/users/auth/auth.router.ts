import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UserRegistrationSchema } from '../user';
import {
  AuthErrorResponseSchema,
  CompleteLoginRequestSchema,
  CompleteLoginResponseSchema,
  CompleteRegistrationRequestSchema,
  CompleteRegistrationResponseSchema,
  LoginStartRequestSchema,
  LoginStartResponseSchema,
  LogoutRequestSchema,
  LogoutResponseSchema,
  RegistrationResponseSchema,
  TokenRefreshRequestSchema,
  TokenRefreshResponseSchema,
} from './auth.types';
import { LoginService } from './login.service';
import { RegistrationService } from './registration.service';

// Challenge storage - in production, use Redis or similar
const challengeStore = new Map<
  string,
  { challenge: string; userId?: string; expires: number }
>();

// Clean up expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of challengeStore.entries()) {
    if (value.expires < now) {
      challengeStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export async function AuthRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _loginService = inject(LoginService);
  const _registrationService = inject(RegistrationService);

  /**
   * 📝 REGISTER USER
   */
  typedFastify.post(
    '/register',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Register a new user - passkeys mandatory for security!',
        body: UserRegistrationSchema,
        response: {
          201: RegistrationResponseSchema,
          409: AuthErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userData = request.body;
      const result = await _registrationService.startRegistration(userData);

      challengeStore.set(result.sessionId, {
        challenge: result.registrationOptions.challenge,
        userId: result.user.id,
        expires: Date.now() + 5 * 60 * 1000,
      });

      return reply.code(201).send(result);
    }
  );

  /**
   * ✅ COMPLETE INITIAL PASSKEY REGISTRATION
   */
  typedFastify.post(
    '/register/complete',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Complete initial passkey registration for new users',
        body: CompleteRegistrationRequestSchema,
        response: { 200: CompleteRegistrationResponseSchema },
      },
    },
    async (request, reply) => {
      const { sessionId, credential } = request.body;

      const challengeData = challengeStore.get(sessionId);
      if (!challengeData || !challengeData.userId) {
        throw fastify.httpErrors.badRequest('Invalid or expired session');
      }

      const result = await _registrationService.completeRegistration(
        challengeData.userId,
        credential,
        challengeData.challenge,
        fastify
      );

      challengeStore.delete(sessionId);
      return reply.send(result);
    }
  );

  /**
   * 🔑 START LOGIN
   */
  typedFastify.post(
    '/login',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Start passkey authentication (passwordless login)',
        body: LoginStartRequestSchema,
        response: { 200: LoginStartResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await _loginService.startLogin(request.body?.username);

      challengeStore.set(result.sessionId, {
        challenge: result.options.challenge,
        expires: Date.now() + 5 * 60 * 1000,
      });

      return reply.send(result);
    }
  );

  /**
   * ✅ COMPLETE LOGIN
   */
  typedFastify.post(
    '/login/complete',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Complete passkey authentication',
        body: CompleteLoginRequestSchema,
        response: { 200: CompleteLoginResponseSchema },
      },
    },
    async (request, reply) => {
      const { sessionId, credential } = request.body;

      const challengeData = challengeStore.get(sessionId);
      if (!challengeData) {
        throw fastify.httpErrors.badRequest('Invalid or expired session');
      }

      const result = await _loginService.completeLogin(
        credential,
        challengeData.challenge,
        fastify
      );

      challengeStore.delete(sessionId);
      return reply.send(result);
    }
  );

  /**
   * 🔄 REFRESH ACCESS TOKEN
   */
  typedFastify.post(
    '/token/refresh',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Refresh access token using refresh token',
        body: TokenRefreshRequestSchema,
        response: {
          200: TokenRefreshResponseSchema,
          401: AuthErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;

      if (!refreshToken) {
        throw fastify.httpErrors.unauthorized('No refresh token provided');
      }

      const result = await _loginService.refreshTokens(refreshToken, fastify);
      return reply.send(result);
    }
  );

  /**
   * 🚪 LOGOUT
   */
  typedFastify.post(
    '/logout',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Logout user and revoke tokens',
        body: LogoutRequestSchema.optional(),
        response: { 200: LogoutResponseSchema },
      },
    },
    async (request, reply) => {
      const refreshToken = request.body?.refreshToken;
      const result = await _loginService.logout(refreshToken);
      return reply.send(result);
    }
  );
}
