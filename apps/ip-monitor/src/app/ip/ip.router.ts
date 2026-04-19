import { FastifyInstance } from 'fastify';
import { inject } from '@ee/di';
import { IpService } from './ip.service';

export async function IpRouter(fastify: FastifyInstance) {
  const ipService = inject(IpService);

  /** GET /ip — current IP */
  fastify.get('/', async (_req, reply) => {
    const current = await ipService.getCurrent();
    if (!current) {
      return reply.status(404).send({ error: 'No IP records yet' });
    }
    return current;
  });

  /** GET /ip/history — recent IP check history */
  fastify.get('/history', async (req, _reply) => {
    const limit = Number((req.query as any).limit) || 50;
    return ipService.getHistory(limit);
  });

  /** POST /ip/check — trigger an immediate check */
  fastify.post('/check', async (_req, _reply) => {
    const record = await ipService.check();
    return record;
  });
}
