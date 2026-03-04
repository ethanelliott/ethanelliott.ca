import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { TasksRouter } from './tasks/tasks.router';
import { ProjectsRouter } from './projects/projects.router';
import { startExpiryCron } from './expiry';

// Side-effect imports — register all entities into the DI ENTITIES token
import './tasks';

// Resolve static UI directory: prefer sibling public/ui next to main.js (dist),
// fall back to source tree (dev via `bun nx serve`).
const candidates = [
  join(fileURLToPath(import.meta.url), '..', 'public', 'ui', 'browser'),
  join(process.cwd(), 'apps', 'kanban', 'public', 'ui', 'browser'),
];
const uiDir = candidates.find(existsSync);

export async function Application(fastify: FastifyInstance) {
  // Start the stale-task expiry background job
  startExpiryCron();

  // Serve the compiled Angular frontend at /ui
  if (uiDir) {
    await fastify.register(fastifyStatic, {
      root: uiDir,
      prefix: '/ui/',
    });

    // SPA fallback — any /ui/* miss should serve index.html
    fastify.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/ui')) {
        return reply.sendFile('index.html', uiDir);
      }
      reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    });
  } else {
    fastify.log.warn('UI static dir not found, /ui route disabled');
  }

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(TasksRouter, { prefix: '/tasks' });

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(ProjectsRouter, { prefix: '/projects' });
}
