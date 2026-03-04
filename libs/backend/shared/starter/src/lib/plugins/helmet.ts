import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export const HelmetPlugin = fp(async function HelmetPlugin(
  fastify: FastifyInstance
) {
  await fastify.register(helmet, { contentSecurityPolicy: false });
});
