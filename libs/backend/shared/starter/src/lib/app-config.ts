import { Provide } from '@ee/di';
import { FastifyServerOptions } from 'fastify';

export type AppConfig = {
  providers: Array<Provide<any>>;
  logger?: FastifyServerOptions['logger'];
};
