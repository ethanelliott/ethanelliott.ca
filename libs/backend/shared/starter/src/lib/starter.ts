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

  const server = Fastify({
    logger: true,
  });

  await server.register(MainPlugin);
  await server.register(Application);

  server.listen({ port: 8080 }, (err) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
  });
}
