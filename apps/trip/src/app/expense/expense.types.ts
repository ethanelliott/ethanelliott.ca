import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

export const ExpenseSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  activityId: z.string().uuid().nullable(),
  activityTitle: z.string().nullable(),
  item: z.string(),
  type: z.string(),
  amountCents: z.number(),
  chargeDate: dateString.nullable(),
  paid: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateExpenseSchema = z.object({
  item: z.string().min(1).max(200),
  type: z.string().min(1).max(50).default('OTHER'),
  // Major units (dollars); converted to cents server-side. Negative = credit.
  amount: z.number().finite(),
  chargeDate: dateString.nullable().optional(),
  paid: z.boolean().default(false),
  activityId: z.string().uuid().nullable().optional(),
});

export const UpdateExpenseSchema = z.object({
  item: z.string().min(1).max(200).optional(),
  type: z.string().min(1).max(50).optional(),
  amount: z.number().finite().optional(),
  chargeDate: dateString.nullable().optional(),
  paid: z.boolean().optional(),
  activityId: z.string().uuid().nullable().optional(),
});

export type ExpenseOut = z.infer<typeof ExpenseSchema>;
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;
