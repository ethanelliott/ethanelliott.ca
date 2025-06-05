import { FastifyInstance } from 'fastify';
import { MainPlugin } from './plugins';
import { RootRouter } from './routes/root';

export const Application = function (fastify: FastifyInstance) {
  fastify.register(MainPlugin);

  fastify.register(RootRouter);
};
