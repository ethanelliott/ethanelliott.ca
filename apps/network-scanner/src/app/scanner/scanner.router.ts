import { FastifyInstance } from 'fastify';
import { inject } from '@ee/di';
import { ScannerService } from './scanner.service';

export async function ScannerRouter(fastify: FastifyInstance) {
  const scanner = inject(ScannerService);

  /** GET /scanner — current inventory snapshot as JSON (handy for debugging). */
  fastify.get('/', async () => scanner.snapshot());

  /** GET /scanner/devices — just the device list. */
  fastify.get('/devices', async () => scanner.snapshot().devices);
}
