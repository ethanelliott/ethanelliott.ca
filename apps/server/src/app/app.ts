import { FastifyInstance } from 'fastify';
import { RootRouter } from './root/root';

export async function Application(fastify: FastifyInstance) {
  fastify.register(RootRouter);
}
