import { inject } from '@ee/di';
import { createReadStream, statSync } from 'fs';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { StreamService } from '../stream/stream.service';
import {
  RecordingSettingsSchema,
  UpdateRecordingSettingsSchema,
} from './recording.entity';
import { RecordingService } from './recording.service';

const RecordingStatusSchema = z.object({
  enabled: z.boolean(),
  segmentCount: z.number(),
  totalSizeMB: z.number(),
  oldestTimestamp: z.string().nullable(),
  newestTimestamp: z.string().nullable(),
  retentionDays: z.number(),
  segmentSeconds: z.number(),
  estimatedDailyGB: z.number().nullable(),
});

export async function RecordingRouter(fastify: FastifyInstance) {
  const recordingService = inject(RecordingService);
  const streamService = inject(StreamService);

  // Get recording settings
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/settings',
    {
      schema: {
        response: {
          200: RecordingSettingsSchema,
        },
      },
    },
    async () => {
      return recordingService.getSettings();
    }
  );

  // Update recording settings. Toggling recording or changing the
  // segment length restarts the FFmpeg pipeline so the new outputs
  // take effect immediately; retention changes apply right away.
  fastify.withTypeProvider<ZodTypeProvider>().put(
    '/settings',
    {
      schema: {
        body: UpdateRecordingSettingsSchema,
        response: {
          200: RecordingSettingsSchema,
        },
      },
    },
    async (request) => {
      const { settings, requiresStreamRestart } =
        await recordingService.updateSettings(request.body);

      if (requiresStreamRestart) {
        console.log('🎞️ Recording settings changed — restarting stream');
        streamService.stop();
        await streamService.start();
      }

      return settings;
    }
  );

  // Get recording status (coverage window, size, write rate)
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/status',
    {
      schema: {
        response: {
          200: RecordingStatusSchema,
        },
      },
    },
    async () => {
      return recordingService.getStatus();
    }
  );

  // Extract and serve an MP4 clip for a time window.
  // Supports HTTP Range requests so the <video> element can seek.
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/clip',
    {
      schema: {
        querystring: z.object({
          start: z.coerce.date(),
          duration: z.coerce.number().min(5).max(300).default(30),
        }),
      },
    },
    async (request, reply) => {
      const { start, duration } = request.query;

      const clip = await recordingService.extractClip(start, duration);
      if (!clip) {
        reply
          .code(404)
          .send({ error: 'No recorded video available for this time range' });
        return;
      }

      const { size } = statSync(clip.path);

      // Cross-Origin-Resource-Policy must override helmet's same-origin
      // default — without it the browser blocks the <video> element's
      // cross-origin media request right after the headers arrive.
      reply
        .header('Content-Type', 'video/mp4')
        .header('Accept-Ranges', 'bytes')
        .header('Cache-Control', 'private, max-age=300')
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .header('Access-Control-Allow-Origin', '*');

      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const rangeStart = match?.[1] ? parseInt(match[1], 10) : 0;
        const rangeEnd =
          match?.[2] && match[2] !== ''
            ? Math.min(parseInt(match[2], 10), size - 1)
            : size - 1;

        if (!match || rangeStart > rangeEnd || rangeStart >= size) {
          reply
            .code(416)
            .header('Content-Range', `bytes */${size}`)
            .send({ error: 'Range not satisfiable' });
          return reply;
        }

        reply
          .code(206)
          .header('Content-Range', `bytes ${rangeStart}-${rangeEnd}/${size}`)
          .header('Content-Length', rangeEnd - rangeStart + 1)
          .send(createReadStream(clip.path, { start: rangeStart, end: rangeEnd }));
        return reply;
      }

      reply
        .header('Content-Length', size)
        .send(createReadStream(clip.path));
      return reply;
    }
  );
}
