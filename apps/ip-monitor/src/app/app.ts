import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { inject } from '@ee/di';

import { IpRouter } from './ip/ip.router';
import { IpService } from './ip/ip.service';

// Import entity registrations
import './ip';

export async function Application(fastify: FastifyInstance) {
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(IpRouter, { prefix: '/ip' });

  // Start the periodic IP check loop once the server is ready
  fastify.addHook('onReady', async () => {
    const ipService = inject(IpService);
    try {
      await ipService.start();
      console.log('🌐 IP Monitor service started');
    } catch (err) {
      console.error('❌ Failed to start IP Monitor:', err);
    }
  });

  // Clean up on shutdown
  fastify.addHook('onClose', async () => {
    const ipService = inject(IpService);
    ipService.stop();
  });
}
