import { Provide } from '@ee/di';
import { FastifyServerOptions } from 'fastify';

export type AppConfig = {
  providers: Array<Provide<any>>;
  logger?: FastifyServerOptions['logger'];
  /** Default port when `PORT` env var is not set. Falls back to 3000. */
  port?: number;
};
