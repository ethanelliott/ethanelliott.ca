import { FastifyInstance } from 'fastify';
import { RootRouter } from './routes/root';

export async function Application(fastify: FastifyInstance) {
  fastify.register(RootRouter);
}
