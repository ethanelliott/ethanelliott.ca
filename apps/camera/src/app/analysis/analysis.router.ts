import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AnalysisService } from './analysis.service';
import {
  SceneAnalysisOutSchema,
  AnalysisSettingsSchema,
  UpdateAnalysisSettingsSchema,
} from './analysis.entity';

export async function AnalysisRouter(fastify: FastifyInstance) {
  const analysisService = inject(AnalysisService);

  // Get scene analyses with pagination and filtering
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
          detectionEventId: z.string().uuid().optional(),
          label: z.string().optional(),
        }),
        response: {
          200: z.object({
            analyses: z.array(SceneAnalysisOutSchema),
            total: z.number(),
          }),
        },
      },
    },
    async (request) => {
      return analysisService.getAnalyses({
        limit: request.query.limit,
        offset: request.query.offset,
        detectionEventId: request.query.detectionEventId,
        label: request.query.label,
      });
    }
  );

  // Get analysis for a specific detection event
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/by-detection/:detectionEventId',
    {
      schema: {
        params: z.object({
          detectionEventId: z.string().uuid(),
        }),
        response: {
          200: SceneAnalysisOutSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const analysis = await analysisService.getByDetectionEventId(
        request.params.detectionEventId
      );
      if (!analysis) {
        return reply.code(404).send({ error: 'No analysis found for this detection event' });
      }
      return analysis;
    }
  );

  // Get a specific analysis by ID
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: SceneAnalysisOutSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const analysis = await analysisService.getById(request.params.id);
      if (!analysis) {
        return reply.code(404).send({ error: 'Scene analysis not found' });
      }
      return analysis;
    }
  );

  // Get analysis settings
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/settings',
    {
      schema: {
        response: {
          200: AnalysisSettingsSchema,
        },
      },
    },
    async () => {
      return analysisService.getSettings();
    }
  );

  // Update analysis settings
  fastify.withTypeProvider<ZodTypeProvider>().put(
    '/settings',
    {
      schema: {
        body: UpdateAnalysisSettingsSchema,
        response: {
          200: AnalysisSettingsSchema,
        },
      },
    },
    async (request) => {
      return analysisService.updateSettings(request.body);
    }
  );
}
