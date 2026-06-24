import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Expected a hex colour');

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

// ─────────────────────────────────────────────────────────────
// Tags (free-form text labels — colour lives on the legend)
// ─────────────────────────────────────────────────────────────

export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(60),
});

export const UpdateTagSchema = z.object({
  name: z.string().min(1).max(60).optional(),
});

// ─────────────────────────────────────────────────────────────
// Legend categories (a named colour that activities can adopt)
// ─────────────────────────────────────────────────────────────

export const LegendCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateLegendCategorySchema = z.object({
  name: z.string().min(1).max(60),
  color: hexColor.default('#4f46e5'),
});

export const UpdateLegendCategorySchema = z.object({
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
  legendCategory: LegendCategorySchema.nullable().optional(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  locationLabel: z.string().nullable(),
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
    color: hexColor.nullable().optional(),
    legendCategoryId: z.string().uuid().nullable().optional(),
    lat: lat.nullable().optional(),
    lng: lng.nullable().optional(),
    locationLabel: z.string().max(300).nullable().optional(),
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
    legendCategoryId: z.string().uuid().nullable().optional(),
    lat: lat.nullable().optional(),
    lng: lng.nullable().optional(),
    locationLabel: z.string().max(300).nullable().optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (a) => !a.startAt || !a.endAt || new Date(a.endAt) > new Date(a.startAt),
    { message: 'endAt must be after startAt', path: ['endAt'] }
  );

export type TagOut = z.infer<typeof TagSchema>;
export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;
export type LegendCategoryOut = z.infer<typeof LegendCategorySchema>;
export type CreateLegendCategoryInput = z.infer<
  typeof CreateLegendCategorySchema
>;
export type UpdateLegendCategoryInput = z.infer<
  typeof UpdateLegendCategorySchema
>;
export type ActivityOut = z.infer<typeof ActivitySchema>;
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type UpdateActivityInput = z.infer<typeof UpdateActivitySchema>;
