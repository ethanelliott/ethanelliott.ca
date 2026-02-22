import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CameraService } from './camera.service';

const CameraInfoSchema = z.object({
  ip: z.string(),
  model: z.string(),
  rtspUrl: z.string(),
  onvifPort: z.number(),
  status: z.enum(['online', 'offline', 'unknown']),
});

export async function CameraRouter(fastify: FastifyInstance) {
  const cameraService = inject(CameraService);

  // Get camera info and status
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/info',
    {
      schema: {
        response: {
          200: CameraInfoSchema,
        },
      },
    },
    async () => {
      return cameraService.getInfo();
    }
  );

  // Force rediscovery of camera stream
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/rediscover',
    {
      schema: {
        response: {
          200: z.object({
            rtspUrl: z.string(),
          }),
        },
      },
    },
    async () => {
      const rtspUrl = await cameraService.rediscover();
      return { rtspUrl: rtspUrl.replace(/:[^:@]+@/, ':***@') };
    }
  );
}
