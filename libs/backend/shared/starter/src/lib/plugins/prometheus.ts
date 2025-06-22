import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import metrics from 'fastify-metrics';

export const PrometheusPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(metrics, { endpoint: '/prometheus' });
});
