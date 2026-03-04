import Fastify, { FastifyPluginAsync } from 'fastify';
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

  // Avoid pino-pretty's worker-thread transport — it requires `real-require`
  // which cannot be resolved inside a `bun build --compile` binary.
  const defaultLogger: Record<string, unknown> = {
    level: isProduction ? 'info' : 'debug',
  };

  const server = Fastify({
    logger: appConfig.logger !== undefined ? appConfig.logger : defaultLogger,
  });

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
