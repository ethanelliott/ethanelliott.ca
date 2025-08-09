import { inject } from '@ee/di';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from './auth.service';
import {
  SafeUserSchema,
  UserLogin,
  UserLoginSchema,
  UserRegistration,
  UserRegistrationSchema,
} from './user';
import { UsersService } from './users.service';

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

export async function UsersRouter(fastify: FastifyInstance) {
  const _usersService = inject(UsersService);
  const _authService = inject(AuthService);

  // 🎯 === AUTHENTICATION ROUTES === 🎯

  /**
   * 📝 REGISTER USER - Passkeys required for maximum security!
   */
  fastify.post(
    '/register',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Register a new user - passkeys mandatory for security!',
        body: UserRegistrationSchema,
        response: {
          201: z.object({
            success: z.boolean(),
            user: SafeUserSchema,
            registrationOptions: z.object({
              userId: z.string(),
              options: z.any(), // PublicKeyCredentialCreationOptionsJSON
              challenge: z.string(),
            }),
            sessionId: z.string(),
            message: z.string(),
          }),
          409: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userData = request.body as UserRegistration;

      const { user, registrationOptions } = await _authService.registerUser(
        userData
      );

      // Store challenge temporarily for passkey registration
      const sessionId = `reg_${user.id}_${Date.now()}`;
      challengeStore.set(sessionId, {
        challenge: registrationOptions.challenge,
        userId: user.id,
        expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      return reply.code(201).send({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          isActive: user.isActive,
          requireMFA: user.requireMFA,
          lastLoginAt: user.lastLoginAt,
          timestamp: user.timestamp,
          updatedAt: user.updatedAt,
        },
        registrationOptions: {
          userId: registrationOptions.userId,
          options: registrationOptions.options,
          challenge: registrationOptions.challenge,
        },
        sessionId,
        message:
          '🔑 Account created! Please complete passkey setup to secure your account.',
      });
    }
  );

  /**
   * ✅ COMPLETE INITIAL PASSKEY REGISTRATION (for new users)
   */
  fastify.post(
    '/register/complete',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Complete initial passkey registration for new users',
        body: z.object({
          sessionId: z.string(),
          credential: z.any(), // RegistrationResponseJSON
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            user: z.object({
              id: z.string(),
              username: z.string(),
              name: z.string(),
            }),
            credential: z.object({
              id: z.string(),
              deviceType: z.string().optional(),
              backedUp: z.boolean(),
              createdAt: z.date(),
            }),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { sessionId, credential } = request.body as {
        sessionId: string;
        credential: RegistrationResponseJSON;
      };

      const challengeData = challengeStore.get(sessionId);
      if (!challengeData || !challengeData.userId) {
        throw fastify.httpErrors.badRequest('Invalid or expired session');
      }

      const userCredential = await _authService.completePasskeyRegistration(
        challengeData.userId,
        credential,
        challengeData.challenge
      );

      challengeStore.delete(sessionId);

      // Generate tokens for the newly registered user
      const user = await _usersService.getById(challengeData.userId);
      if (!user) {
        throw fastify.httpErrors.internalServerError(
          'User not found after registration'
        );
      }

      // Generate access token and refresh token
      const accessToken = (fastify as any).signToken({
        userId: user.id,
        username: user.username,
      });

      // Generate refresh token manually
      const refreshTokenValue =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);

      // Set secure cookies
      (fastify as any).setAuthCookies(reply, accessToken, refreshTokenValue);

      return reply.send({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
        },
        credential: {
          id: userCredential.id,
          deviceType: userCredential.deviceType,
          backedUp: userCredential.backedUp,
          createdAt: userCredential.createdAt,
        },
        message: '🎉 Welcome! Your account is now secured with a passkey.',
      });
    }
  );

  /**
   * 🚀 START PASSKEY REGISTRATION (for existing authenticated users)
   */
  fastify.post(
    '/passkey/register/start',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['Passkeys'],
        description: 'Start passkey registration for authenticated user',
        response: {
          200: z.object({
            success: z.boolean(),
            options: z.any(), // PublicKeyCredentialCreationOptionsJSON
            sessionId: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;

      const registrationOptions = await _authService.startPasskeyRegistration(
        userId
      );

      // Store challenge temporarily
      const sessionId = `reg_${userId}_${Date.now()}`;
      challengeStore.set(sessionId, {
        challenge: registrationOptions.challenge,
        userId: userId,
        expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      return reply.send({
        success: true,
        options: registrationOptions.options,
        sessionId,
      });
    }
  );

  /**
   * ✅ COMPLETE PASSKEY REGISTRATION (for existing authenticated users)
   */
  fastify.post(
    '/passkey/register/complete',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['Passkeys'],
        description: 'Complete passkey registration',
        body: z.object({
          sessionId: z.string(),
          credential: z.any(), // RegistrationResponseJSON
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            credential: z.object({
              id: z.string(),
              deviceType: z.string().optional(),
              backedUp: z.boolean(),
              createdAt: z.date(),
            }),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { sessionId, credential } = request.body as {
        sessionId: string;
        credential: RegistrationResponseJSON;
      };
      const userId = (request as any).user.userId;

      const challengeData = challengeStore.get(sessionId);
      if (!challengeData || challengeData.userId !== userId) {
        throw fastify.httpErrors.badRequest('Invalid or expired session');
      }

      const userCredential = await _authService.completePasskeyRegistration(
        userId,
        credential,
        challengeData.challenge
      );

      challengeStore.delete(sessionId);

      return reply.send({
        success: true,
        credential: {
          id: userCredential.id,
          deviceType: userCredential.deviceType,
          backedUp: userCredential.backedUp,
          createdAt: userCredential.createdAt,
        },
        message:
          '🎉 Passkey registered successfully! Your account is now more secure.',
      });
    }
  );

  /**
   * 🔑 START PASSKEY AUTHENTICATION
   */
  fastify.post(
    '/passkey/login/start',
    {
      schema: {
        tags: ['Passkeys'],
        description: 'Start passkey authentication (passwordless login)',
        body: z
          .object({
            username: z.string().optional(),
          })
          .optional(),
        response: {
          200: z.object({
            success: z.boolean(),
            options: z.any(), // PublicKeyCredentialRequestOptionsJSON
            sessionId: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const username = (request.body as { username?: string })?.username;

      const authenticationOptions =
        await _authService.startPasskeyAuthentication(username);

      // Store challenge temporarily
      const sessionId = `auth_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      challengeStore.set(sessionId, {
        challenge: authenticationOptions.challenge,
        expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      return reply.send({
        success: true,
        options: authenticationOptions.options,
        sessionId,
      });
    }
  );

  /**
   * ✅ COMPLETE PASSKEY AUTHENTICATION
   */
  fastify.post(
    '/passkey/login/complete',
    {
      schema: {
        tags: ['Passkeys'],
        description: 'Complete passkey authentication',
        body: z.object({
          sessionId: z.string(),
          credential: z.any(), // AuthenticationResponseJSON
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            user: z.object({
              id: z.string(),
              username: z.string(),
              name: z.string(),
            }),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { sessionId, credential } = request.body as {
        sessionId: string;
        credential: AuthenticationResponseJSON;
      };

      const challengeData = challengeStore.get(sessionId);
      if (!challengeData) {
        throw fastify.httpErrors.badRequest('Invalid or expired session');
      }

      const tokens = await _authService.completePasskeyAuthentication(
        credential,
        challengeData.challenge
      );

      challengeStore.delete(sessionId);

      // Sign the JWT token properly
      const accessToken = (fastify as any).signToken({
        userId: tokens.user.id,
        username: tokens.user.username,
      });

      // Set secure cookies
      (fastify as any).setAuthCookies(reply, accessToken, tokens.refreshToken);

      return reply.send({
        success: true,
        user: tokens.user,
        message: '🚀 Welcome back! Logged in with passkey.',
      });
    }
  );

  /**
   * 🔄 REFRESH ACCESS TOKEN
   */
  fastify.post(
    '/token/refresh',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Refresh access token using refresh token',
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies.refreshToken;

      if (!refreshToken) {
        throw fastify.httpErrors.unauthorized('No refresh token provided');
      }

      const tokens = await _authService.refreshTokens(refreshToken);

      // Sign the JWT token properly
      const accessToken = (fastify as any).signToken({
        userId: tokens.user.id,
        username: tokens.user.username,
      });

      // Set new secure cookies
      (fastify as any).setAuthCookies(reply, accessToken, tokens.refreshToken);

      return reply.send({
        success: true,
        message: 'Tokens refreshed successfully',
      });
    }
  );

  /**
   * 🚪 LOGOUT
   */
  fastify.post(
    '/logout',
    {
      preHandler: [(fastify as any).optionalAuthenticate],
      schema: {
        tags: ['Authentication'],
        description: 'Logout user and revoke tokens',
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies.refreshToken;

      if (refreshToken) {
        await _authService.logout(refreshToken);
      }

      // Clear auth cookies
      (fastify as any).clearAuthCookies(reply);

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    }
  );

  // 👤 === USER PROFILE ROUTES === 👤

  /**
   * 📊 GET USER PROFILE
   */
  fastify.get(
    '/profile',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['User Profile'],
        description: 'Get current user profile with security information',
        response: {
          200: z.object({
            success: z.boolean(),
            user: SafeUserSchema,
            credentials: z.array(
              z.object({
                id: z.string(),
                deviceType: z.string().optional(),
                backedUp: z.boolean(),
                createdAt: z.date(),
                lastUsed: z.date(),
              })
            ),
            hasPassword: z.boolean(),
            securityScore: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;

      const profile = await _authService.getUserProfile(userId);

      return reply.send({
        success: true,
        user: {
          id: profile.user.id,
          name: profile.user.name,
          username: profile.user.username,
          isActive: profile.user.isActive,
          requireMFA: profile.user.requireMFA,
          lastLoginAt: profile.user.lastLoginAt,
          timestamp: profile.user.timestamp,
          updatedAt: profile.user.updatedAt,
        },
        credentials: profile.credentials.map((cred) => ({
          id: cred.id,
          deviceType: cred.deviceType,
          backedUp: cred.backedUp,
          createdAt: cred.createdAt,
          lastUsed: cred.lastUsed,
        })),
        hasPassword: profile.hasPassword,
        securityScore: profile.securityScore,
      });
    }
  );

  /**
   * ✏️ UPDATE PROFILE
   */
  fastify.put(
    '/profile',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['User Profile'],
        description: 'Update user profile information',
        body: z.object({
          name: z.string().min(1).max(100).optional(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            user: SafeUserSchema,
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;
      const updates = request.body as { name?: string };

      const updatedUser = await _usersService.updateProfile(userId, updates);

      return reply.send({
        success: true,
        user: updatedUser,
        message: 'Profile updated successfully',
      });
    }
  );

  /**
   * 🗑️ DELETE PASSKEY
   */
  fastify.delete(
    '/passkey/:credentialId',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['Passkeys'],
        description: 'Delete a specific passkey',
        params: z.object({
          credentialId: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;
      const { credentialId } = request.params as { credentialId: string };

      await _authService.deletePasskey(userId, credentialId);

      return reply.send({
        success: true,
        message: 'Passkey deleted successfully',
      });
    }
  );

  /**
   * 🔒 REVOKE ALL SESSIONS
   */
  fastify.post(
    '/security/revoke-all',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['Security'],
        description: 'Revoke all active sessions (except current)',
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;

      await _authService.revokeAllSessions(userId);

      return reply.send({
        success: true,
        message: 'All sessions revoked successfully',
      });
    }
  );

  /**
   * ❌ DELETE ACCOUNT
   */
  fastify.delete(
    '/account',
    {
      preHandler: [(fastify as any).authenticate],
      schema: {
        tags: ['User Profile'],
        description: 'Delete user account (irreversible)',
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.userId;

      const deleted = await _usersService.deleteAccount(userId);

      if (!deleted) {
        throw fastify.httpErrors.internalServerError(
          'Failed to delete account'
        );
      }

      // Clear auth cookies
      (fastify as any).clearAuthCookies(reply);

      return reply.send({
        success: true,
        message: 'Account deleted successfully',
      });
    }
  );

  /**
   * 🗑️ ADMIN: WIPE ALL USERS
   */
  fastify.delete(
    '/admin/all',
    {
      schema: {
        tags: ['Admin'],
        description: 'Wipe all users (admin/testing only)',
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      await _authService.deleteAllUsers();

      return reply.send({
        success: true,
        message: 'All users deleted successfully',
      });
    }
  );
}
