import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { inject } from '@ee/di';
import { z } from 'zod';
import { CleanupService } from './cleanup.service';

const CleanupStatusSchema = z.object({
  retentionDays: z.number(),
  maxSnapshots: z.number(),
  diskThresholdPct: z.number(),
  diskUsagePct: z.number().nullable(),
  snapshotCount: z.number(),
  snapshotSizeMB: z.number(),
  dbSizeMB: z.number(),
  detectionEventCount: z.number(),
  analysisCount: z.number(),
  recordingCount: z.number(),
  recordingSizeMB: z.number(),
  videoRetentionDays: z.number(),
});

export async function CleanupRouter(fastify: FastifyInstance) {
  const cleanupService = inject(CleanupService);

  // GET /cleanup/status — current storage stats
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/status',
    {
      schema: {
        response: {
          200: CleanupStatusSchema,
        },
      },
    },
    async () => {
      return cleanupService.getStatus();
    }
  );

  // POST /cleanup/trigger — run cleanup immediately
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/trigger',
    {
      schema: {
        response: {
          200: z.object({ success: z.boolean() }),
        },
      },
    },
    async () => {
      await cleanupService.runNow();
      return { success: true };
    }
  );
}
