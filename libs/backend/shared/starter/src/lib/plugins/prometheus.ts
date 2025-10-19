import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import metrics from 'fastify-metrics';

export const PrometheusPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(metrics, {
    endpoint: '/metrics',
    routeMetrics: {
      enabled: {
        histogram: true,
        summary: false,
      },
      overrides: {
        histogram: {
          buckets: [0.1, 0.3, 0.5, 1, 2, 5],
        },
      },
      routeBlacklist: ['/metrics'],
    },
  });
});
