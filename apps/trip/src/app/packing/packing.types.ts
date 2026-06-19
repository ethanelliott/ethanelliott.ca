import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Expected a hex colour');

export const PackingContainerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  position: z.number(),
});

export const PackingItemSchema = z.object({
  id: z.string().uuid(),
  containerId: z.string().uuid().nullable(),
  name: z.string(),
  count: z.number(),
  ready: z.boolean(),
  packed: z.boolean(),
  verify: z.boolean(),
  position: z.number(),
});

export const PackingListSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  containers: z.array(PackingContainerSchema),
  items: z.array(PackingItemSchema),
});

export const CreateContainerSchema = z.object({
  name: z.string().min(1).max(60),
  color: hexColor.default('#4f46e5'),
});

export const UpdateContainerSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: hexColor.optional(),
});

export const CreateItemSchema = z.object({
  name: z.string().min(1).max(120),
  count: z.number().int().min(1).default(1),
  containerId: z.string().uuid().nullable().optional(),
});

export const UpdateItemSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  count: z.number().int().min(1).optional(),
  containerId: z.string().uuid().nullable().optional(),
  ready: z.boolean().optional(),
  packed: z.boolean().optional(),
  verify: z.boolean().optional(),
});

export const PackingTemplateSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  containerCount: z.number(),
  itemCount: z.number(),
  createdAt: z.date(),
});

export const SaveTemplateSchema = z.object({
  name: z.string().min(1).max(80),
});

export const ApplyTemplateSchema = z.object({
  templateId: z.string().uuid(),
});

export type PackingListOut = z.infer<typeof PackingListSchema>;
export type CreateContainerInput = z.infer<typeof CreateContainerSchema>;
export type UpdateContainerInput = z.infer<typeof UpdateContainerSchema>;
export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
export type PackingTemplateSummary = z.infer<typeof PackingTemplateSummarySchema>;
