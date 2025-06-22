import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export async function RootRouter(fastify: FastifyInstance) {
  fastify.get(
    '/',
    { preHandler: fastify.circuitBreaker() },
    async function (request, reply) {
      return reply.send({ message: 'Hello API' });
    }
  );

  fastify.post(
    '/',
    {
      preHandler: fastify.circuitBreaker(),
      schema: {
        body: z.object({
          name: z.string(),
        }),
      },
    },
    async function (request, reply) {
      return reply.send({ message: 'Hello API', echo: request.body });
    }
  );
}
