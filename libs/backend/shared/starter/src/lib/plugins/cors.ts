import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export const CorsPlugin = fp(async function CorsPlugin(
  fastify: FastifyInstance
) {
  const allowedOrigin = process.env.CORS_ORIGIN ?? true;
  await fastify.register(cors, {
    origin: allowedOrigin,
    methods: [
      'GET',
      'HEAD',
      'PUT',
      'POST',
      'PATCH',
      'DELETE',
      'CONNECT',
      'OPTIONS',
      'TRACE',
    ],
  });
});
