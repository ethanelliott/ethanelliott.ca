import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SnapshotService } from './snapshot.service';

const SnapshotInfoSchema = z.object({
  filename: z.string(),
  label: z.string(),
  confidence: z.number(),
  size: z.number(),
  createdAt: z.string(),
});

export async function SnapshotRouter(fastify: FastifyInstance) {
  const snapshotService = inject(SnapshotService);

  // List snapshots with pagination
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
          label: z.string().optional(),
        }),
        response: {
          200: z.object({
            snapshots: z.array(SnapshotInfoSchema),
            total: z.number(),
          }),
        },
      },
    },
    async (request) => {
      return snapshotService.listSnapshots({
        limit: request.query.limit,
        offset: request.query.offset,
        label: request.query.label,
      });
    }
  );

  // Get a snapshot image
  fastify.get<{ Params: { filename: string } }>(
    '/:filename',
    async (request, reply) => {
      const result = snapshotService.readSnapshot(request.params.filename);
      if (!result) {
        reply.code(404).send({ error: 'Snapshot not found' });
        return;
      }

      reply
        .header('Content-Type', result.mimeType)
        .header('Cache-Control', 'public, max-age=86400')
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(result.data);
    }
  );

  // Delete a snapshot
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    '/:filename',
    {
      schema: {
        params: z.object({
          filename: z.string(),
        }),
        response: {
          200: z.object({ success: z.boolean() }),
        },
      },
    },
    async (request) => {
      const success = snapshotService.deleteSnapshot(request.params.filename);
      return { success };
    }
  );

  // Cleanup old snapshots
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/cleanup',
    {
      schema: {
        body: z.object({
          keepCount: z.number().int().positive().default(500),
        }),
        response: {
          200: z.object({
            deleted: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const deleted = snapshotService.cleanup(request.body.keepCount);
      return { deleted };
    }
  );
}
