import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotificationService } from './notification.service';
import {
  NotificationSettingsSchema,
  UpdateNotificationSettingsSchema,
  NotificationTestResultSchema,
} from './notification.entity';

export async function NotificationRouter(fastify: FastifyInstance) {
  const notificationService = inject(NotificationService);

  // Get notification settings
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/',
    {
      schema: {
        response: {
          200: NotificationSettingsSchema,
        },
      },
    },
    async () => {
      return notificationService.getSettings();
    }
  );

  // Update notification settings
  fastify.withTypeProvider<ZodTypeProvider>().put(
    '/',
    {
      schema: {
        body: UpdateNotificationSettingsSchema,
        response: {
          200: NotificationSettingsSchema,
        },
      },
    },
    async (request) => {
      return notificationService.updateSettings(request.body);
    }
  );

  // Send a test notification
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/test',
    {
      schema: {
        response: {
          200: NotificationTestResultSchema,
        },
      },
    },
    async () => {
      return notificationService.sendTestNotification();
    }
  );
}
