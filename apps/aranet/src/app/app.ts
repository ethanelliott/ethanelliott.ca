import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { inject } from '@ee/di';

import { AranetRouter } from './aranet/aranet.router';
import { AranetService } from './aranet/aranet.service';

// Import entity registrations
import './aranet';

export async function Application(fastify: FastifyInstance) {
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(AranetRouter, { prefix: '/aranet' });

  // Start the BLE scan loop once the server is ready.
  fastify.addHook('onReady', async () => {
    const aranetService = inject(AranetService);
    try {
      await aranetService.start();
      console.log('🌬️  Aranet service started');
    } catch (err) {
      console.error('❌ Failed to start Aranet service:', err);
    }
  });

  // Clean up on shutdown.
  fastify.addHook('onClose', async () => {
    const aranetService = inject(AranetService);
    await aranetService.stop();
  });
}
