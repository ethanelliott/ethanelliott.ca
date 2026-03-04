import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import underPressure from '@fastify/under-pressure';

export const UnderPressurePlugin = fp(async function UnderPressurePlugin(
  fastify: FastifyInstance
) {
  await fastify.register(underPressure);
});
