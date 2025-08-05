import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export const SwaggerPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Server',
        description: 'The server',
        version: '0.0.1',
      },
    },
    transform: jsonSchemaTransform,
  });

  await fastify.register(swaggerUI, {
    routePrefix: '/swagger',
    uiConfig: {
      deepLinking: true,
      syntaxHighlight: {
        activate: true,
        theme: 'nord',
      },
    },
  });
});
