import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export async function RootRouter(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  typedFastify.get(
    '/',
    { preHandler: fastify.circuitBreaker() },
    async function (request, reply) {
      return reply.send({ message: 'Hello API' });
    }
  );

  typedFastify.post(
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
      // request.body is now automatically typed based on the schema
      return reply.send({ message: 'Hello API', echo: request.body });
    }
  );
}
