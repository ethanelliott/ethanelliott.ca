import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import prometheus from 'prom-client';

export const K8sPlugin = fp(async function (fastify: FastifyInstance) {
  fastify.get('/liveness', async (request, reply) => {
    reply.send({ live: true });
  });

  fastify.get('/readiness', async (request, reply) => {
    const metric = prometheus.register.getSingleMetric(
      'http_request_summary_seconds'
    );
    const { values } = await metric.get();

    const pt999 = values
      .filter((e) => 'quantile' in e.labels && e.labels.quantile === 0.999)
      .reduce((a, c) => {
        return a === 0 ? c.value : (a + c.value) / 2;
      }, 0);

    return reply.send({ ready: true, values: pt999 });
  });
});
