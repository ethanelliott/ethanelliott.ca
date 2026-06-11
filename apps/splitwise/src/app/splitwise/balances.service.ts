import { inject } from '@ee/di';
import { Database } from '../data-source';
import { User } from '../users/user';
import { Expense } from './expense.entity';
import { Group, GroupMember } from './group.entity';
import { Settlement } from './settlement.entity';
import { toPublicUser } from './mappers';
import { GroupBalancesOut } from './splitwise.types';

export class BalancesService {
  private readonly _expenseRepository = inject(Database).repositoryFor(Expense);
  private readonly _settlementRepository =
    inject(Database).repositoryFor(Settlement);
  private readonly _memberRepository =
    inject(Database).repositoryFor(GroupMember);

  /**
   * Compute each member's net balance (in cents) for a group.
   * Positive => the group owes them; negative => they owe the group.
   */
  async computeNet(groupId: string): Promise<Map<string, number>> {
    const net = new Map<string, number>();

    const add = (userId: string, delta: number) => {
      net.set(userId, (net.get(userId) ?? 0) + delta);
    };

    // Ensure every current member appears, even with a zero balance.
    const members = await this._memberRepository.find({
      where: { group: { id: groupId } },
    });
    for (const member of members) {
      net.set(member.user.id, 0);
    }

    const expenses = await this._expenseRepository.find({
      where: { group: { id: groupId } },
    });
    for (const expense of expenses) {
      add(expense.paidBy.id, expense.amountCents);
      for (const split of expense.splits ?? []) {
        add(split.user.id, -split.amountCents);
      }
    }

    const settlements = await this._settlementRepository.find({
      where: { group: { id: groupId } },
    });
    for (const settlement of settlements) {
      add(settlement.fromUser.id, settlement.amountCents);
      add(settlement.toUser.id, -settlement.amountCents);
    }

    return net;
  }

  /**
   * Greedily reduce a set of net balances into a minimal list of
   * "who pays whom" transactions.
   */
  simplifyDebts(
    net: Map<string, number>
  ): Array<{ fromUserId: string; toUserId: string; amountCents: number }> {
    const debtors: Array<{ id: string; amount: number }> = [];
    const creditors: Array<{ id: string; amount: number }> = [];

    for (const [id, amount] of net.entries()) {
      if (amount < 0) debtors.push({ id, amount: -amount });
      else if (amount > 0) creditors.push({ id, amount });
    }

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const result: Array<{
      fromUserId: string;
      toUserId: string;
      amountCents: number;
    }> = [];

    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(debtor.amount, creditor.amount);

      if (amount > 0) {
        result.push({
          fromUserId: debtor.id,
          toUserId: creditor.id,
          amountCents: amount,
        });
      }

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount === 0) i++;
      if (creditor.amount === 0) j++;
    }

    return result;
  }

  async getGroupBalances(group: Group): Promise<GroupBalancesOut> {
    const net = await this.computeNet(group.id);

    const members = await this._memberRepository.find({
      where: { group: { id: group.id } },
    });
    const userById = new Map<string, User>();
    for (const member of members) {
      userById.set(member.user.id, member.user);
    }

    const balances = [...net.entries()]
      .filter(([id]) => userById.has(id))
      .map(([id, netCents]) => ({
        user: toPublicUser(userById.get(id)!),
        netCents,
      }))
      .sort((a, b) => b.netCents - a.netCents);

    const debts = this.simplifyDebts(net)
      .filter((debt) => userById.has(debt.fromUserId) && userById.has(debt.toUserId))
      .map((debt) => ({
        from: toPublicUser(userById.get(debt.fromUserId)!),
        to: toPublicUser(userById.get(debt.toUserId)!),
        amountCents: debt.amountCents,
      }));

    return { currency: group.currency, balances, debts };
  }
}
