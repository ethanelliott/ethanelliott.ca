import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { StreamService } from './stream.service';

export async function StreamRouter(fastify: FastifyInstance) {
  const streamService = inject(StreamService);

  // Get stream status
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/status',
    {
      schema: {
        response: {
          200: z.object({
            running: z.boolean(),
            hlsFiles: z.array(z.string()),
          }),
        },
      },
    },
    async () => {
      return {
        running: streamService.isRunning(),
        hlsFiles: streamService.listHlsFiles(),
      };
    }
  );

  // Serve HLS playlist (m3u8)
  fastify.get('/hls/stream.m3u8', async (_request, reply) => {
    const data = streamService.readHlsFile('stream.m3u8');
    if (!data) {
      reply.code(404).send({ error: 'Stream not available' });
      return;
    }

    reply
      .header('Content-Type', 'application/vnd.apple.mpegurl')
      .header('Cache-Control', 'no-cache, no-store')
      .header('Access-Control-Allow-Origin', '*')
      .send(data);
  });

  // Serve HLS segments (.ts files)
  fastify.get<{ Params: { filename: string } }>(
    '/hls/:filename',
    async (request, reply) => {
      const { filename } = request.params;

      // Only allow .ts files
      if (!filename.endsWith('.ts')) {
        reply.code(400).send({ error: 'Invalid segment file' });
        return;
      }

      const data = streamService.readHlsFile(filename);
      if (!data) {
        reply.code(404).send({ error: 'Segment not found' });
        return;
      }

      reply
        .header('Content-Type', 'video/mp2t')
        .header('Cache-Control', 'public, max-age=3600')
        .header('Access-Control-Allow-Origin', '*')
        .send(data);
    }
  );

  // Restart stream
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/restart',
    {
      schema: {
        response: {
          200: z.object({ success: z.boolean() }),
        },
      },
    },
    async () => {
      streamService.stop();
      await streamService.start();
      return { success: true };
    }
  );
}
