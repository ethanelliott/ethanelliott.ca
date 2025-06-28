import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { SensiblePlugin } from './sensible';
import { SwaggerPlugin } from './swagger';
import { CircuitBreakerPlugin } from './circuit-breaker';
import { UnderPressurePlugin } from './under-pressure';
import { RateLimitPlugin } from './rate-limit';
import { PrometheusPlugin } from './prometheus';
import { HelmetPlugin } from './helmet';
import { ZodPlugin } from './zod';
import { CorsPlugin } from './cors';
import { ReferencePlugin } from './reference';
import { K8sPlugin } from './k8s';
import { GracefulShutdownPlugin } from './graceful-shutdown';

export const MainPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(GracefulShutdownPlugin);
  await fastify.register(SensiblePlugin);
  await fastify.register(CircuitBreakerPlugin);
  await fastify.register(UnderPressurePlugin);
  await fastify.register(RateLimitPlugin);
  await fastify.register(PrometheusPlugin);
  await fastify.register(HelmetPlugin);
  await fastify.register(ZodPlugin);
  await fastify.register(CorsPlugin);
  await fastify.register(K8sPlugin);

  // Must register swagger last ...
  await fastify.register(SwaggerPlugin);
  await fastify.register(ReferencePlugin);
});
