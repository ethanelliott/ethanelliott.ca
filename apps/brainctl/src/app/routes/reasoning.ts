import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { reason, infer, dream, inferPretask, inferGapfill } from '../services/reasoning.service.js';
import { isLlmAvailable } from '../services/llm.service.js';

const BaseReasonSchema = z.object({
  agent_id: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(8192).optional(),
  context_limit: z.number().int().min(1).max(50).optional(),
});

function requireLlm(reply: any): boolean {
  if (!isLlmAvailable()) {
    reply.status(503).send({ error: 'LLM unavailable — set LITELLM_BASE_URL to enable reasoning endpoints' });
    return false;
  }
  return true;
}

export async function ReasoningRoutes(fastify: FastifyInstance) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  // Grounded Q&A: retrieve relevant memories, answer using LLM
  f.post('/reason', {
    schema: {
      body: BaseReasonSchema.extend({
        query: z.string().min(1),
        memory_types: z.array(z.string()).optional(),
      }),
    },
  }, async (req, reply) => {
    if (!requireLlm(reply)) return;
    return reply.send(await reason(req.body));
  });

  // Draw inferences from a premise + supporting memories
  f.post('/infer', {
    schema: {
      body: BaseReasonSchema.extend({
        premise: z.string().min(1),
        context: z.array(z.string()).optional(),
        depth: z.enum(['shallow', 'deep']).optional(),
      }),
    },
  }, async (req, reply) => {
    if (!requireLlm(reply)) return;
    return reply.send(await infer(req.body));
  });

  // Pre-task briefing: what does the agent know about this task?
  f.post('/infer/pretask', {
    schema: {
      body: BaseReasonSchema.extend({
        query: z.string().min(1),
      }),
    },
  }, async (req, reply) => {
    if (!requireLlm(reply)) return;
    return reply.send(await inferPretask(req.body));
  });

  // Knowledge gap analysis: what's missing on this topic?
  f.post('/infer/gapfill', {
    schema: {
      body: BaseReasonSchema.extend({
        query: z.string().min(1),
      }),
    },
  }, async (req, reply) => {
    if (!requireLlm(reply)) return;
    return reply.send(await inferGapfill(req.body));
  });

  // Dream cycle: synthesise hypotheses from recent high-confidence memories
  f.post('/dream', {
    schema: {
      body: BaseReasonSchema.extend({
        topic: z.string().optional(),
        memory_limit: z.number().int().min(1).max(100).optional(),
        min_confidence: z.number().min(0).max(1).optional(),
      }),
    },
  }, async (req, reply) => {
    if (!requireLlm(reply)) return;
    return reply.send(await dream(req.body));
  });
}
