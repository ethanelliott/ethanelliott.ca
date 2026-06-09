import { z } from 'zod';

export const MemorySchema = z.object({
  id: z.number(),
  agent_id: z.string(),
  content: z.string(),
  category: z.string(),
  tags: z.string().nullable(),
  confidence: z.number(),
  memory_type: z.string(),
  scope: z.string(),
  replay_priority: z.number(),
  ripple_tags: z.number(),
  recalled_count: z.number(),
  temporal_class: z.string(),
  last_accessed_at: z.string().nullable(),
  compressed_into: z.number().nullable(),
  quarantined_at: z.string().nullable().optional(),
  created_at: z.string(),
  retired_at: z.string().nullable(),
});

export const EventSchema = z.object({
  id: z.number(),
  agent_id: z.string(),
  summary: z.string(),
  event_type: z.string(),
  project: z.string().nullable(),
  importance: z.number(),
  created_at: z.string(),
});

export const EntitySchema = z.object({
  id: z.number(),
  agent_id: z.string(),
  name: z.string(),
  entity_type: z.string(),
  properties: z.string().nullable(),
  observations: z.string().nullable(),
  compiled_truth: z.string().nullable(),
  tier: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ErrorSchema = z.object({ error: z.string() });
export const DeletedSchema = z.object({ deleted: z.boolean() });
export const IdSchema = z.object({ id: z.number() });
