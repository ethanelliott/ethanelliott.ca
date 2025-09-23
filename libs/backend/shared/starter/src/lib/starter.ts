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
    // logger: {
    //   transport: {
    //     target: 'pino-pretty',
    //   },
    // },
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
    console.log(`Server listening on ${host}:${port}`);
  });
}
