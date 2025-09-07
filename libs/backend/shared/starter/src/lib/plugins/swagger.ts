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
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your JWT token in the format: Bearer <token>',
          },
        },
      },
    },
    transform: ({ schema, url, route }) => {
      // First apply the default transformation
      const transformedSchema = jsonSchemaTransform({ schema, url });

      // Check if the route has authentication preHandlers
      if (route?.preHandler && Array.isArray(route.preHandler)) {
        const hasAuthenticate = route.preHandler.some((handler: any) => {
          // Check if this is the authenticate handler
          return (
            typeof handler === 'function' &&
            (handler.name === 'authenticate' ||
              handler.toString().includes('authenticate'))
          );
        });

        if (hasAuthenticate && transformedSchema.schema) {
          transformedSchema.schema.security = [{ bearerAuth: [] }];
        }
      }

      return transformedSchema;
    },
  });

  await fastify.register(swaggerUI, {
    routePrefix: '/swagger',
    uiConfig: {
      deepLinking: true,
      syntaxHighlight: {
        activate: true,
        theme: 'nord',
      },
      persistAuthorization: true,
      tryItOutEnabled: true,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    transformStaticCSP: (header) => header,
  });
});
