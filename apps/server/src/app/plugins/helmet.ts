import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export const HelmetPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(helmet, { contentSecurityPolicy: false });
});
