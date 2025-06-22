import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export const CorsPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(cors);
});
