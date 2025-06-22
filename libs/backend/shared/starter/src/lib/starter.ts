import Fastify, { FastifyPluginAsync } from 'fastify';
import { AppConfig } from './app-config';
import { MainPlugin } from './plugins';
import { provide } from '@ee/di';

export async function starter<T extends FastifyPluginAsync>(
  Application: T,
  appConfig?: AppConfig
) {
  for (const provider of appConfig.providers) {
    provide(provider);
  }

  const host = process.env.HOST ?? '0.0.0.0';
  const port = process.env.PORT ? Number(process.env.PORT) : 8080;

  const server = Fastify({
    logger: true,
  });

  await server.register(MainPlugin);

  await server.register(Application);

  server.listen({ port, host }, (err) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    } else {
      console.log(`[ ready ] http://${host}:${port}`);
    }
  });
}
