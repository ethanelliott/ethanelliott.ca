import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export const RateLimitPlugin = fp(async function RateLimitPlugin(
  fastify: FastifyInstance
) {
  await fastify.register(rateLimit, {
    global: true,
    max: 10000,
    timeWindow: 1000,
  });
});
