import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import apiReference from '@scalar/fastify-api-reference';

export const ReferencePlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(apiReference, {
    routePrefix: '/reference',
    configuration: {
      withDefaultFonts: false,
      hideDownloadButton: true,
    },
  });
});
