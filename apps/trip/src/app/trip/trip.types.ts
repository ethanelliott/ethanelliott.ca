import { z } from 'zod';
import { PublicUserSchema } from '../users/user';

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

/** Validate an IANA timezone string (e.g. 'Europe/Berlin'). */
const timezone = z.string().refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid IANA timezone' }
);

/** Calendar date string, YYYY-MM-DD. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Expected a hex colour');

// ─────────────────────────────────────────────────────────────
// Trips
// ─────────────────────────────────────────────────────────────

export const TripMemberSchema = z.object({
  id: z.string().uuid(),
  user: PublicUserSchema,
  role: z.enum(['owner', 'member']),
  joinedAt: z.date(),
});

export const SegmentSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  city: z.string(),
  country: z.string().nullable().optional(),
  hotelName: z.string().nullable().optional(),
  timezone: z.string(),
  startDate: dateString,
  endDate: dateString,
  color: z.string().nullable().optional(),
  position: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const TripSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  homeTimezone: z.string(),
  baseCurrency: z.string(),
  createdBy: PublicUserSchema.nullable().optional(),
  members: z.array(TripMemberSchema),
  segments: z.array(SegmentSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const TripSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  homeTimezone: z.string(),
  baseCurrency: z.string(),
  memberCount: z.number(),
  members: z.array(TripMemberSchema),
  segmentCount: z.number(),
  // Derived span across all segments (null when there are no segments yet).
  startDate: dateString.nullable(),
  endDate: dateString.nullable(),
  updatedAt: z.date(),
});

export const CreateTripSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  homeTimezone: timezone.default('America/Toronto'),
  baseCurrency: z.string().min(1).max(8).default('CAD'),
  memberUsernames: z.array(z.string()).optional(),
});

export const UpdateTripSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  homeTimezone: timezone.optional(),
  baseCurrency: z.string().min(1).max(8).optional(),
});

export const AddMemberSchema = z.object({
  username: z.string().min(1),
});

// ─────────────────────────────────────────────────────────────
// Segments
// ─────────────────────────────────────────────────────────────

export const CreateSegmentSchema = z
  .object({
    city: z.string().min(1).max(120),
    country: z.string().max(120).optional(),
    hotelName: z.string().max(200).optional(),
    timezone: timezone,
    startDate: dateString,
    endDate: dateString,
    color: hexColor.optional(),
  })
  .refine((s) => s.startDate <= s.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate'],
  });

export const UpdateSegmentSchema = z
  .object({
    city: z.string().min(1).max(120).optional(),
    country: z.string().max(120).optional(),
    hotelName: z.string().max(200).optional(),
    timezone: timezone.optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    color: hexColor.optional(),
  })
  .refine((s) => !s.startDate || !s.endDate || s.startDate <= s.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate'],
  });

export const ReorderSegmentsSchema = z.object({
  // Segment ids in their new order.
  segmentIds: z.array(z.string().uuid()).min(1),
});

export type TripOut = z.infer<typeof TripSchema>;
export type TripSummaryOut = z.infer<typeof TripSummarySchema>;
export type SegmentOut = z.infer<typeof SegmentSchema>;
export type CreateTripInput = z.infer<typeof CreateTripSchema>;
export type UpdateTripInput = z.infer<typeof UpdateTripSchema>;
export type CreateSegmentInput = z.infer<typeof CreateSegmentSchema>;
export type UpdateSegmentInput = z.infer<typeof UpdateSegmentSchema>;
export type ReorderSegmentsInput = z.infer<typeof ReorderSegmentsSchema>;
