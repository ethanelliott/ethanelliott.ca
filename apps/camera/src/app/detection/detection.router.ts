import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DetectionService } from './detection.service';
import {
  DetectionEventOutSchema,
  DetectionStatsSchema,
  DetectionSettingsSchema,
  UpdateDetectionSettingsSchema,
} from './detection.entity';

export async function DetectionRouter(fastify: FastifyInstance) {
  const detectionService = inject(DetectionService);

  // Get detection events with pagination and filtering
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
          label: z.string().optional(),
          minConfidence: z.coerce.number().min(0).max(1).optional(),
          since: z.coerce.date().optional(),
        }),
        response: {
          200: z.object({
            events: z.array(DetectionEventOutSchema),
            total: z.number(),
          }),
        },
      },
    },
    async (request) => {
      return detectionService.getEvents({
        limit: request.query.limit,
        offset: request.query.offset,
        label: request.query.label,
        minConfidence: request.query.minConfidence,
        since: request.query.since,
      });
    }
  );

  // Get detection statistics
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/stats',
    {
      schema: {
        response: {
          200: DetectionStatsSchema,
        },
      },
    },
    async () => {
      return detectionService.getStats();
    }
  );

  // Get a specific detection event
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: DetectionEventOutSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const event = await detectionService.getById(request.params.id);
      if (!event) {
        return reply.code(404).send({ error: 'Detection event not found' });
      }
      return event;
    }
  );

  // Get detection label settings
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/settings',
    {
      schema: {
        response: {
          200: DetectionSettingsSchema,
        },
      },
    },
    async () => {
      return detectionService.getSettings();
    }
  );

  // Update detection label settings
  fastify.withTypeProvider<ZodTypeProvider>().put(
    '/settings',
    {
      schema: {
        body: UpdateDetectionSettingsSchema,
        response: {
          200: DetectionSettingsSchema,
        },
      },
    },
    async (request) => {
      detectionService.setEnabledLabels(request.body.enabledLabels);
      return detectionService.getSettings();
    }
  );
}
