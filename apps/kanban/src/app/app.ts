import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TasksRouter } from './tasks/tasks.router';
import { ProjectsRouter } from './projects/projects.router';
import { startExpiryCron } from './expiry';

// Side-effect imports — register all entities into the DI ENTITIES token
import './tasks';

export async function Application(fastify: FastifyInstance) {
  // Start the stale-task expiry background job
  startExpiryCron();

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(TasksRouter, { prefix: '/tasks' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(ProjectsRouter, { prefix: '/projects' });
}
