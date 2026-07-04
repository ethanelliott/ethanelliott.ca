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
import { ChallengeService } from './challenge.service';
import { LoginService } from './login.service';
import { RegistrationService } from './registration.service';

export async function AuthRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const _loginService = inject(LoginService);
  const _registrationService = inject(RegistrationService);
  const _challenges = inject(ChallengeService);

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

      await _challenges.put(
        result.sessionId,
        result.registrationOptions.challenge,
        result.user.id
      );

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

      const challengeData = await _challenges.take(sessionId);
      if (!challengeData || !challengeData.userId) {
        throw fastify.httpErrors.badRequest('Invalid or expired session');
      }

      const result = await _registrationService.completeRegistration(
        challengeData.userId,
        credential,
        challengeData.challenge,
        fastify
      );

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

      await _challenges.put(result.sessionId, result.options.challenge);

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

      // take() consumes the challenge, so each ceremony is single-use even
      // when verification fails.
      const challengeData = await _challenges.take(sessionId);
      if (!challengeData) {
        throw fastify.httpErrors.badRequest('Invalid or expired session');
      }

      const result = await _loginService.completeLogin(
        credential,
        challengeData.challenge,
        fastify
      );

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
