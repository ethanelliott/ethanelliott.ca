export interface PublicUser {
  id: string;
  name: string;
  username: string;
}

export interface Profile {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  timestamp: string;
  updatedAt: string;
}

export interface GroupMember {
  id: string;
  user: PublicUser;
  joinedAt: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  currency: string;
  createdBy?: PublicUser | null;
  members: GroupMember[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  currency: string;
  memberCount: number;
  members: GroupMember[];
  yourBalanceCents: number;
  updatedAt: string;
}

export interface ExpenseSplit {
  id: string;
  user: PublicUser;
  amountCents: number;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amountCents: number;
  currency: string;
  category?: string | null;
  paidBy: PublicUser;
  splitType: string;
  date: string;
  splits: ExpenseSplit[];
  createdAt: string;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUser: PublicUser;
  toUser: PublicUser;
  amountCents: number;
  currency: string;
  note?: string | null;
  date: string;
  createdAt: string;
}

export interface MemberBalance {
  user: PublicUser;
  netCents: number;
}

export interface SimplifiedDebt {
  from: PublicUser;
  to: PublicUser;
  amountCents: number;
}

export interface GroupBalances {
  currency: string;
  balances: MemberBalance[];
  debts: SimplifiedDebt[];
}

export interface Overview {
  currency: string;
  youAreOwedCents: number;
  youOweCents: number;
  netCents: number;
}

export interface ActivityItem {
  expense: Expense;
  groupName: string;
}

export type SplitType = 'equal' | 'exact' | 'percentage';

export interface CreateExpenseRequest {
  description: string;
  amount: number;
  currency?: string;
  category?: string;
  paidByUserId: string;
  date?: string;
  splitType: SplitType;
  splits: { userId: string; value?: number }[];
}

export interface CreateSettlementRequest {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency?: string;
  note?: string;
  date?: string;
}
