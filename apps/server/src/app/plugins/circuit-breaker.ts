import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import circuitBreaker from '@fastify/circuit-breaker';

export const CircuitBreakerPlugin = fp(async function (
  fastify: FastifyInstance
) {
  await fastify.register(circuitBreaker, {
    threshold: 3,
    timeout: 5000,
    resetTimeout: 10000,
  });
});
