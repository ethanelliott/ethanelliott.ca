import Fastify, { FastifyPluginAsync } from 'fastify';
import pino from 'pino';
import pretty from 'pino-pretty';
import { AppConfig } from './app-config';
import { MainPlugin } from './plugins';
import { provide } from '@ee/di';
import { injectApplicationInitializers } from './app-initializer';

export async function starter<T extends FastifyPluginAsync>(
  Application: T,
  appConfig: AppConfig
) {
  for (const provider of appConfig.providers) {
    provide(provider as any);
  }

  await injectApplicationInitializers().reduce(
    (a, c) => a.then(() => c()),
    Promise.resolve()
  );

  const isProduction = process.env.NODE_ENV === 'production';

  // Use pino-pretty as a synchronous in-process stream (not a worker-thread
  // transport). sync:true avoids thread-stream / real-require, so this works
  // inside a `bun build --compile` binary just as well as in `bun nx serve`.
  const defaultLogger = isProduction
    ? pino({ level: 'info' })
    : pino({ level: 'debug' }, pretty({ colorize: true, sync: true }));

  const server = Fastify(
    appConfig.logger !== undefined
      ? { logger: appConfig.logger }
      : { loggerInstance: defaultLogger }
  );

  await server.register(MainPlugin);
  await server.register(Application);

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  server.listen({ host, port }, (err) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    server.log.info(`Server listening on ${host}:${port}`);
  });
}
