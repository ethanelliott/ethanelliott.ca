import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { classifyAffect, logAffect } from '../services/affect.service.js';

export async function AffectRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post('/affect', {
    schema: {
      body: z.object({
        text: z.string().min(1),
        source: z.string().optional(),
        agent_id: z.string().optional(),
        store: z.boolean().optional(),
      }),
    },
  }, async (req, reply) => {
    const result = classifyAffect(req.body.text);

    if (req.body.store) {
      const id = logAffect(req.body.text, req.body.source ?? 'observation', req.body.agent_id);
      return reply.send({ ...result, stored_id: id });
    }

    return reply.send(result);
  });
}
