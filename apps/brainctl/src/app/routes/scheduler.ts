import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  addSchedule,
  removeSchedule,
  listSchedules,
  getSchedule,
  pauseSchedule,
  resumeSchedule,
} from '../services/scheduler.service.js';

const PassEnum = z.enum(['decay', 'promote', 'compress', 'hebbian', 'gap_scan', 'entity_tiers']);

const ScheduleBodySchema = z.object({
  cron: z.string().min(1),
  agent_id: z.string().optional(),
  enabled: z.boolean().optional(),
  options: z.object({
    dry_run: z.boolean().optional(),
    batch_limit: z.coerce.number().int().optional(),
    decay_rate: z.number().optional(),
    promote_min_priority: z.number().optional(),
    promote_min_ripple_tags: z.number().int().optional(),
    promote_min_confidence: z.number().optional(),
    compression_min_cluster: z.number().int().optional(),
    hebbian_boost: z.number().optional(),
    prune_threshold: z.number().optional(),
    passes: z.array(PassEnum).optional(),
  }).optional(),
});

export async function SchedulerRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get('/scheduler', async (_req, reply) => {
    return reply.send(listSchedules());
  });

  f.post('/scheduler', {
    schema: { body: ScheduleBodySchema },
  }, async (req, reply) => {
    try {
      const entry = addSchedule(req.body);
      return reply.status(201).send(entry);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  f.get('/scheduler/:id', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (req, reply) => {
    const entry = getSchedule(req.params.id);
    if (!entry) return reply.status(404).send({ error: 'Schedule not found' });
    return reply.send(entry);
  });

  f.delete('/scheduler/:id', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (req, reply) => {
    const removed = removeSchedule(req.params.id);
    return reply.send({ removed });
  });

  f.post('/scheduler/:id/pause', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (req, reply) => {
    const ok = pauseSchedule(req.params.id);
    if (!ok) return reply.status(404).send({ error: 'Schedule not found' });
    return reply.send({ paused: true });
  });

  f.post('/scheduler/:id/resume', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (req, reply) => {
    const ok = resumeSchedule(req.params.id);
    if (!ok) return reply.status(404).send({ error: 'Schedule not found' });
    return reply.send({ resumed: true });
  });
}
