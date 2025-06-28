import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import gracefulShutdown from 'fastify-graceful-shutdown';

export const GracefulShutdownPlugin = fp(async function (
  fastify: FastifyInstance
) {
  await fastify.register(gracefulShutdown);
});
