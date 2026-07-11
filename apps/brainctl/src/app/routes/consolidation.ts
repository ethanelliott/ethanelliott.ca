import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  runConsolidationCycle,
  runDecayPass,
  runPromotionPass,
  runCompressionPass,
  runHebbianPass,
  runGapScanPass,
  runEntityTierPass,
  getLastConsolidation,
  getConsolidationHistory,
} from '../services/consolidation.service.js';

const PassEnum = z.enum(['decay', 'promote', 'compress', 'hebbian', 'gap_scan', 'entity_tiers']);

const ConsolidationOptionsSchema = z.object({
  agent_id: z.string().optional(),
  dry_run: z.boolean().optional(),
  batch_limit: z.coerce.number().int().min(1).max(5000).optional(),
  decay_rate: z.number().min(0).max(1).optional(),
  protect_confidence: z.number().min(0).max(1).optional(),
  protect_recall_min: z.coerce.number().int().optional(),
  retire_threshold: z.number().min(0).max(1).optional(),
  promote_min_priority: z.number().min(0).max(1).optional(),
  promote_min_ripple_tags: z.coerce.number().int().optional(),
  promote_min_confidence: z.number().min(0).max(1).optional(),
  compression_min_cluster: z.coerce.number().int().min(2).optional(),
  vec_similarity_threshold: z.number().min(0).max(2).optional(),
  fts_overlap_threshold: z.number().min(0).max(1).optional(),
  hebbian_boost: z.number().min(0).max(1).optional(),
  hebbian_decay: z.number().min(0).max(1).optional(),
  prune_threshold: z.number().min(0).max(1).optional(),
  passes: z.array(PassEnum).optional(),
});

export async function ConsolidationRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // Run a full consolidation cycle (all or selected passes)
  f.post('/consolidation/run', {
    schema: {
      body: ConsolidationOptionsSchema,
    },
  }, async (req, reply) => {
    const { agent_id, ...opts } = req.body;
    const report = await runConsolidationCycle(agent_id ?? 'default', opts);
    return reply.send(report);
  });

  // Status: last run + history
  f.get('/consolidation/status', {
    schema: {
      querystring: z.object({
        agent_id: z.string().optional(),
        history: z.coerce.number().int().min(1).max(50).optional(),
      }),
    },
  }, async (req, reply) => {
    const agentId = req.query.agent_id ?? 'default';
    const last = getLastConsolidation(agentId);
    const history = getConsolidationHistory(agentId, req.query.history ?? 10);
    return reply.send({ last, history });
  });

  // Individual pass endpoints — useful for targeted runs or debugging
  f.post('/consolidation/decay', {
    schema: { body: ConsolidationOptionsSchema },
  }, async (req, reply) => {
    const { agent_id, ...opts } = req.body;
    return reply.send(runDecayPass(agent_id ?? 'default', opts));
  });

  f.post('/consolidation/promote', {
    schema: { body: ConsolidationOptionsSchema },
  }, async (req, reply) => {
    const { agent_id, ...opts } = req.body;
    return reply.send(runPromotionPass(agent_id ?? 'default', opts));
  });

  f.post('/consolidation/compress', {
    schema: { body: ConsolidationOptionsSchema },
  }, async (req, reply) => {
    const { agent_id, ...opts } = req.body;
    return reply.send(await runCompressionPass(agent_id ?? 'default', opts));
  });

  f.post('/consolidation/hebbian', {
    schema: { body: ConsolidationOptionsSchema },
  }, async (req, reply) => {
    const { agent_id, ...opts } = req.body;
    return reply.send(runHebbianPass(agent_id ?? 'default', opts));
  });

  f.post('/consolidation/gap-scan', {
    schema: { body: ConsolidationOptionsSchema },
  }, async (req, reply) => {
    const { agent_id, ...opts } = req.body;
    return reply.send(runGapScanPass(agent_id ?? 'default', opts));
  });

  f.post('/consolidation/entity-tiers', {
    schema: { body: ConsolidationOptionsSchema },
  }, async (req, reply) => {
    const { agent_id, ...opts } = req.body;
    return reply.send(runEntityTierPass(agent_id ?? 'default', opts));
  });
}
