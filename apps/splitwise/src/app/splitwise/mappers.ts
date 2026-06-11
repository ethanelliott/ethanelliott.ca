import { PublicUser, User } from '../users/user';
import { Expense } from './expense.entity';
import { Group, GroupMember } from './group.entity';
import { Settlement } from './settlement.entity';
import { ExpenseOut, SettlementOut } from './splitwise.types';

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, username: user.username };
}

export function toGroupMemberDto(member: GroupMember) {
  return {
    id: member.id,
    user: toPublicUser(member.user),
    joinedAt: member.joinedAt,
  };
}

export function toGroupDto(group: Group, members: GroupMember[]) {
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? null,
    type: group.type,
    currency: group.currency,
    createdBy: group.createdBy ? toPublicUser(group.createdBy) : null,
    members: members.map(toGroupMemberDto),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

export function toExpenseDto(expense: Expense): ExpenseOut {
  return {
    id: expense.id,
    groupId: expense.group.id,
    description: expense.description,
    amountCents: expense.amountCents,
    currency: expense.currency,
    category: expense.category ?? null,
    paidBy: toPublicUser(expense.paidBy),
    splitType: expense.splitType,
    date: expense.date,
    splits: (expense.splits ?? []).map((s) => ({
      id: s.id,
      user: toPublicUser(s.user),
      amountCents: s.amountCents,
    })),
    createdAt: expense.createdAt,
  };
}

export function toSettlementDto(settlement: Settlement): SettlementOut {
  return {
    id: settlement.id,
    groupId: settlement.group.id,
    fromUser: toPublicUser(settlement.fromUser),
    toUser: toPublicUser(settlement.toUser),
    amountCents: settlement.amountCents,
    currency: settlement.currency,
    note: settlement.note ?? null,
    date: settlement.date,
    createdAt: settlement.createdAt,
  };
}
