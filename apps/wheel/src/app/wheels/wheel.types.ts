import { z } from 'zod';

export const WheelTagSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().min(1).max(32),
});

export const WheelItemSchema = z.object({
  label: z.string().min(1).max(120),
  tags: z.array(z.string().min(1).max(40)).default([]),
});

export const WheelSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  tags: z.array(WheelTagSchema),
  items: z.array(WheelItemSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const WheelSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  itemCount: z.number(),
  tagCount: z.number(),
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

export const SuccessSchema = z.object({ success: z.boolean() });

export type WheelTagInput = z.infer<typeof WheelTagSchema>;
export type WheelItemInput = z.infer<typeof WheelItemSchema>;
export type WheelOut = z.infer<typeof WheelSchema>;
export type WheelSummaryOut = z.infer<typeof WheelSummarySchema>;
export type CreateWheelInput = z.infer<typeof CreateWheelSchema>;
export type UpdateWheelInput = z.infer<typeof UpdateWheelSchema>;
