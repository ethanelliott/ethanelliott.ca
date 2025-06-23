import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export const K8sPlugin = fp(async function (fastify: FastifyInstance) {
  fastify.get('/liveness', async (request, reply) => {
    reply.send({ live: true });
  });

  fastify.get('/readiness', async (request, reply) => {
    return reply.send({ ready: true });
  });
});
