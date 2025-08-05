import { FastifyInstance } from 'fastify';
import { FinancesRouter } from './finances/finances';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function Application(fastify: FastifyInstance) {
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(FinancesRouter, { prefix: '/finances' });
}
