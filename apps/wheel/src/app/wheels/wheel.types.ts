import { z } from 'zod';
import { PublicUserSchema } from '../users/user';

export const WheelTagSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().min(1).max(32),
});

export const WheelItemSchema = z.object({
  label: z.string().min(1).max(120),
  tags: z.array(z.string().min(1).max(40)).default([]),
  // Disabled ("archived") items stay in the list but are left out of spins.
  enabled: z.boolean().default(true),
});

export const WheelRoleSchema = z.enum(['owner', 'editor']);

export const WheelSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  tags: z.array(WheelTagSchema),
  items: z.array(WheelItemSchema),
  owner: PublicUserSchema,
  role: WheelRoleSchema,
  sharedWith: z.array(PublicUserSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const WheelSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  itemCount: z.number(),
  tagCount: z.number(),
  role: WheelRoleSchema,
  owner: PublicUserSchema,
  sharedCount: z.number(),
  updatedAt: z.date(),
});

export const CreateWheelSchema = z.object({
  name: z.string().min(1).max(80),
  tags: z.array(WheelTagSchema).optional(),
  items: z.array(WheelItemSchema).optional(),
});

export const UpdateWheelSchema = z.object({
  name: z.string().min(1).max(80),
  tags: z.array(WheelTagSchema),
  items: z.array(WheelItemSchema),
});

export const ShareWheelSchema = z.object({
  username: z.string().min(1).max(50),
});

export const SuccessSchema = z.object({ success: z.boolean() });

export type WheelTagInput = z.infer<typeof WheelTagSchema>;
export type WheelItemInput = z.infer<typeof WheelItemSchema>;
export type WheelOut = z.infer<typeof WheelSchema>;
export type WheelSummaryOut = z.infer<typeof WheelSummarySchema>;
export type CreateWheelInput = z.infer<typeof CreateWheelSchema>;
export type UpdateWheelInput = z.infer<typeof UpdateWheelSchema>;
export type ShareWheelInput = z.infer<typeof ShareWheelSchema>;
