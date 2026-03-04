import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import gracefulShutdown from 'fastify-graceful-shutdown';

export const GracefulShutdownPlugin = fp(async function GracefulShutdownPlugin(
  fastify: FastifyInstance
) {
  await fastify.register(gracefulShutdown);
});
