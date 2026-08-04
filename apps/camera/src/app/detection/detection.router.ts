import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DetectionService } from './detection.service';
import {
  DetectionEventOutSchema,
  DetectionEventWithAnalysisSchema,
  DetectionStatsSchema,
  DetectionSettingsSchema,
  UpdateDetectionSettingsSchema,
} from './detection.entity';
import { THREAT_LEVELS } from '../analysis/taxonomy';

/**
 * Query-string boolean. `z.coerce.boolean()` is not usable here: it follows
 * JS truthiness, so `?flag=false` would come through as true.
 */
const QueryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

export async function DetectionRouter(fastify: FastifyInstance) {
  const detectionService = inject(DetectionService);

  // Get detection events with pagination and filtering
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(500).default(50),
          offset: z.coerce.number().int().min(0).default(0),
          label: z.string().optional(),
          minConfidence: z.coerce.number().min(0).max(1).optional(),
          since: z.coerce.date().optional(),
          until: z.coerce.date().optional(),
          threat: z.enum(THREAT_LEVELS).optional(),
          pinnedOnly: QueryBoolean.optional(),
          includeAnalysis: QueryBoolean.optional(),
        }),
        response: {
          200: z.object({
            events: z.array(DetectionEventWithAnalysisSchema),
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
        until: request.query.until,
        threat: request.query.threat,
        pinnedOnly: request.query.pinnedOnly,
        includeAnalysis: request.query.includeAnalysis,
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

  // Toggle pin status of a detection event
  fastify.withTypeProvider<ZodTypeProvider>().patch(
    '/:id/pin',
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
      const event = await detectionService.togglePin(request.params.id);
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
      if (request.body.enabledLabels) {
        detectionService.setEnabledLabels(request.body.enabledLabels);
      }
      if (request.body.retentionDays !== undefined) {
        detectionService.setRetentionDays(request.body.retentionDays);
      }
      return detectionService.getSettings();
    }
  );
}
