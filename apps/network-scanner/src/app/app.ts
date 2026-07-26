import { FastifyInstance } from 'fastify';
import { inject } from '@ee/di';

import { ScannerRouter } from './scanner/scanner.router';
import { ScannerService } from './scanner/scanner.service';

export async function Application(fastify: FastifyInstance) {
  fastify.register(ScannerRouter, { prefix: '/scanner' });

  // Kick off the scan loops once the server is ready. Prometheus metrics are
  // exposed automatically at /metrics by the shared @ee/starter plugin stack.
  fastify.addHook('onReady', async () => {
    const scanner = inject(ScannerService);
    try {
      await scanner.start();
      console.log('🛰️  Network scanner started');
    } catch (err) {
      console.error('❌ Failed to start network scanner:', err);
    }
  });

  fastify.addHook('onClose', async () => {
    const scanner = inject(ScannerService);
    scanner.stop();
  });
}
