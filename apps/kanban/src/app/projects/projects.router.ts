import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProjectsService, ProjectSummarySchema } from './projects.service';

export async function ProjectsRouter(fastify: FastifyInstance) {
  const projectsService = inject(ProjectsService);

  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        response: { 200: z.array(ProjectSummarySchema) },
      },
    },
    async () => projectsService.listProjects()
  );
}
