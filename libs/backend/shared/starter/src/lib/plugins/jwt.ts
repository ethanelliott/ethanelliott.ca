import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';

export const JWTPlugin = fp(async function (fastify: FastifyInstance) {
  // Register cookie support for refresh tokens
  await fastify.register(cookie, {
    secret:
      process.env.COOKIE_SECRET ||
      'super-secret-cookie-key-change-in-production',
    parseOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    },
  });

  // Register JWT plugin
  await fastify.register(jwt, {
    secret:
      process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production',
    sign: {
      algorithm: 'HS256',
      expiresIn: '15m', // Short-lived access tokens
    },
    verify: {
      algorithms: ['HS256'],
    },
    cookie: {
      cookieName: 'refreshToken',
      signed: false, // We handle our own refresh token validation
    },
  });

  // Add JWT verification decorator
  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      // First check for Bearer token in Authorization header
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = fastify.jwt.verify(token);
        request.user = decoded;
        return;
      }

      // If no Bearer token, check for JWT in cookies (for web apps)
      const cookieToken = request.cookies.accessToken;
      if (cookieToken) {
        const decoded = fastify.jwt.verify(cookieToken);
        request.user = decoded;
        return;
      }

      throw new Error('No valid token found');
    } catch (err) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token',
      });
    }
  });

  // Add optional JWT verification decorator
  fastify.decorate(
    'optionalAuthenticate',
    async function (request: any, reply: any) {
      try {
        // Try to authenticate, but don't throw if it fails
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const decoded = fastify.jwt.verify(token);
          request.user = decoded;
          return;
        }

        const cookieToken = request.cookies.accessToken;
        if (cookieToken) {
          const decoded = fastify.jwt.verify(cookieToken);
          request.user = decoded;
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

  // Helper to set auth cookies
  fastify.decorate(
    'setAuthCookies',
    function (reply: any, accessToken: string, refreshToken: string) {
      // Set access token cookie (short-lived)
      reply.setCookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 15 * 60, // 15 minutes
      });

      // Set refresh token cookie (long-lived)
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }
  );

  // Helper to clear auth cookies
  fastify.decorate('clearAuthCookies', function (reply: any) {
    reply.clearCookie('accessToken', { path: '/' });
    reply.clearCookie('refreshToken', { path: '/' });
  });
});
