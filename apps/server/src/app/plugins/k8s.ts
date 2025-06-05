import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import prometheus from 'prom-client';

export const K8sPlugin = fp(async function (fastify: FastifyInstance) {
  fastify.get('/liveness', async (request, reply) => {
    reply.send({ live: true });
  });

  const metric = new prometheus.Summary({
    name: 'http_request_duration_seconds',
    help: 'request duration summary in seconds',
    maxAgeSeconds: 60,
    ageBuckets: 5,
  });

  metric.get999Percentile = () => {
    return metric.get().values[6].value;
  };

  function canAcceptMoreRequests() {
    // twice the expected duration
    return metric.get999Percentile() <= (0.1 * 2) / 1e3;
  }

  fastify.get('/readiness', async (request, reply) => {
    if (canAcceptMoreRequests()) {
      return reply.send({ ready: true });
    } else {
      throw new Error('NOT READY');
    }
  });
});
