import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Expected a hex colour');

// ─────────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────────────────────────────────

export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(60),
  color: hexColor.default('#4f46e5'),
});

export const UpdateTagSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: hexColor.optional(),
});

// ─────────────────────────────────────────────────────────────
// Activities
// ─────────────────────────────────────────────────────────────

export const ActivitySchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  segmentId: z.string().uuid().nullable(),
  title: z.string(),
  notes: z.string().nullable().optional(),
  startAt: z.date(),
  endAt: z.date(),
  color: z.string().nullable().optional(),
  tags: z.array(TagSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateActivitySchema = z
  .object({
    title: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
    segmentId: z.string().uuid().nullable().optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    color: hexColor.optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  })
  .refine((a) => new Date(a.endAt) > new Date(a.startAt), {
    message: 'endAt must be after startAt',
    path: ['endAt'],
  });

export const UpdateActivitySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    notes: z.string().max(2000).optional(),
    segmentId: z.string().uuid().nullable().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    color: hexColor.nullable().optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (a) => !a.startAt || !a.endAt || new Date(a.endAt) > new Date(a.startAt),
    { message: 'endAt must be after startAt', path: ['endAt'] }
  );

export type TagOut = z.infer<typeof TagSchema>;
export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;
export type ActivityOut = z.infer<typeof ActivitySchema>;
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type UpdateActivityInput = z.infer<typeof UpdateActivitySchema>;
