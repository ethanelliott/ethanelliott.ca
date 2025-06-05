import Fastify from 'fastify';
import { Application } from './app/app';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const server = Fastify({
  logger: true,
});

await server.register(Application);

server.listen({ port, host }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  } else {
    console.log(`[ ready ] http://${host}:${port}`);
  }
});
