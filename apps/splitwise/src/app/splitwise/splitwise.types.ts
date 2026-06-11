import { z } from 'zod';
import { PublicUserSchema } from '../users/user';

// ─────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────

export const GroupMemberSchema = z.object({
  id: z.string().uuid(),
  user: PublicUserSchema,
  joinedAt: z.date(),
});

export const GroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  type: z.string(),
  currency: z.string(),
  createdBy: PublicUserSchema.nullable().optional(),
  members: z.array(GroupMemberSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const GroupSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  type: z.string(),
  currency: z.string(),
  memberCount: z.number(),
  members: z.array(GroupMemberSchema),
  // The current user's net balance in this group, in cents.
  // Positive => the group owes you; negative => you owe.
  yourBalanceCents: z.number(),
  updatedAt: z.date(),
});

export const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['trip', 'home', 'couple', 'other']).default('other'),
  currency: z.string().min(1).max(8).default('USD'),
  memberUsernames: z.array(z.string()).optional(),
});

export const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  type: z.enum(['trip', 'home', 'couple', 'other']).optional(),
  currency: z.string().min(1).max(8).optional(),
});

export const AddMemberSchema = z.object({
  username: z.string().min(1),
});

// ─────────────────────────────────────────────────────────────
// Expenses
// ─────────────────────────────────────────────────────────────

export const ExpenseSplitInputSchema = z.object({
  userId: z.string().uuid(),
  // Used when splitType is 'exact' (dollars) or 'percentage' (0-100).
  value: z.number().nonnegative().optional(),
});

export const CreateExpenseSchema = z.object({
  description: z.string().min(1).max(200),
  // Amount in major units (e.g. dollars). Converted to cents server-side.
  amount: z.number().positive(),
  currency: z.string().min(1).max(8).default('USD'),
  category: z.string().max(50).optional(),
  paidByUserId: z.string().uuid(),
  date: z.string().datetime().optional(),
  splitType: z.enum(['equal', 'exact', 'percentage']).default('equal'),
  // The members to split between. For 'equal' only userId is needed.
  splits: z.array(ExpenseSplitInputSchema).min(1),
});

export const UpdateExpenseSchema = CreateExpenseSchema.partial();

export const ExpenseSplitSchema = z.object({
  id: z.string().uuid(),
  user: PublicUserSchema,
  amountCents: z.number(),
});

export const ExpenseSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  description: z.string(),
  amountCents: z.number(),
  currency: z.string(),
  category: z.string().nullable().optional(),
  paidBy: PublicUserSchema,
  splitType: z.string(),
  date: z.date(),
  splits: z.array(ExpenseSplitSchema),
  createdAt: z.date(),
});

// ─────────────────────────────────────────────────────────────
// Settlements
// ─────────────────────────────────────────────────────────────

export const CreateSettlementSchema = z.object({
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().min(1).max(8).default('USD'),
  note: z.string().max(200).optional(),
  date: z.string().datetime().optional(),
});

export const SettlementSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  fromUser: PublicUserSchema,
  toUser: PublicUserSchema,
  amountCents: z.number(),
  currency: z.string(),
  note: z.string().nullable().optional(),
  date: z.date(),
  createdAt: z.date(),
});

// ─────────────────────────────────────────────────────────────
// Balances
// ─────────────────────────────────────────────────────────────

export const MemberBalanceSchema = z.object({
  user: PublicUserSchema,
  // Net balance in cents. Positive => owed money; negative => owes money.
  netCents: z.number(),
});

export const SimplifiedDebtSchema = z.object({
  from: PublicUserSchema,
  to: PublicUserSchema,
  amountCents: z.number(),
});

export const GroupBalancesSchema = z.object({
  currency: z.string(),
  balances: z.array(MemberBalanceSchema),
  debts: z.array(SimplifiedDebtSchema),
});

// ─────────────────────────────────────────────────────────────
// Activity / dashboard
// ─────────────────────────────────────────────────────────────

export const ActivityItemSchema = z.object({
  expense: ExpenseSchema,
  groupName: z.string(),
});

export const OverviewSchema = z.object({
  currency: z.string(),
  // Total others owe you across all groups (cents)
  youAreOwedCents: z.number(),
  // Total you owe across all groups (cents)
  youOweCents: z.number(),
  netCents: z.number(),
});

export type GroupOut = z.infer<typeof GroupSchema>;
export type GroupSummaryOut = z.infer<typeof GroupSummarySchema>;
export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;
export type ExpenseOut = z.infer<typeof ExpenseSchema>;
export type CreateSettlementInput = z.infer<typeof CreateSettlementSchema>;
export type SettlementOut = z.infer<typeof SettlementSchema>;
export type GroupBalancesOut = z.infer<typeof GroupBalancesSchema>;
export type OverviewOut = z.infer<typeof OverviewSchema>;
