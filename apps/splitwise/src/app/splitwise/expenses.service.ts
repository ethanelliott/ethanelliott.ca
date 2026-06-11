import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { UsersService } from '../users/users.service';
import { Expense, ExpenseSplit, SplitType } from './expense.entity';
import { GroupMember } from './group.entity';
import { GroupsService } from './groups.service';
import { toExpenseDto } from './mappers';
import {
  CreateExpenseInput,
  ExpenseOut,
  ExpenseSplitInputSchema,
} from './splitwise.types';
import { z } from 'zod';

type SplitInput = z.infer<typeof ExpenseSplitInputSchema>;

export class ExpensesService {
  private readonly _expenseRepository = inject(Database).repositoryFor(Expense);
  private readonly _memberRepository =
    inject(Database).repositoryFor(GroupMember);
  private readonly _groupsService = inject(GroupsService);
  private readonly _usersService = inject(UsersService);

  /**
   * Turn the requested split into a concrete list of integer-cent shares that
   * sums exactly to `totalCents`. Any rounding remainder is distributed one
   * cent at a time across the participants.
   */
  private computeShares(
    totalCents: number,
    splitType: SplitType,
    splits: SplitInput[]
  ): Array<{ userId: string; amountCents: number }> {
    if (splits.length === 0) {
      throw new HttpErrors.BadRequest('At least one participant is required');
    }

    const shares: Array<{ userId: string; amountCents: number }> = [];

    if (splitType === 'equal') {
      const base = Math.floor(totalCents / splits.length);
      let remainder = totalCents - base * splits.length;
      for (const split of splits) {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        shares.push({ userId: split.userId, amountCents: base + extra });
      }
      return shares;
    }

    if (splitType === 'exact') {
      let sum = 0;
      for (const split of splits) {
        const cents = Math.round((split.value ?? 0) * 100);
        sum += cents;
        shares.push({ userId: split.userId, amountCents: cents });
      }
      if (sum !== totalCents) {
        throw new HttpErrors.BadRequest(
          `Exact split shares (${sum} cents) must sum to the total (${totalCents} cents)`
        );
      }
      return shares;
    }

    // percentage
    const totalPct = splits.reduce((acc, s) => acc + (s.value ?? 0), 0);
    if (Math.round(totalPct) !== 100) {
      throw new HttpErrors.BadRequest('Percentages must add up to 100');
    }
    let allocated = 0;
    splits.forEach((split, index) => {
      const isLast = index === splits.length - 1;
      const cents = isLast
        ? totalCents - allocated
        : Math.round(((split.value ?? 0) / 100) * totalCents);
      allocated += cents;
      shares.push({ userId: split.userId, amountCents: cents });
    });
    return shares;
  }

  private async assertUsersAreMembers(groupId: string, userIds: string[]) {
    const members = await this._memberRepository.find({
      where: { group: { id: groupId } },
    });
    const memberIds = new Set(members.map((m) => m.user.id));
    for (const id of userIds) {
      if (!memberIds.has(id)) {
        throw new HttpErrors.BadRequest(
          'All participants and the payer must be members of the group'
        );
      }
    }
  }

  async list(groupId: string, userId: string): Promise<ExpenseOut[]> {
    await this._groupsService.assertMember(groupId, userId);
    const expenses = await this._expenseRepository.find({
      where: { group: { id: groupId } },
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return expenses.map(toExpenseDto);
  }

  async getById(expenseId: string, userId: string): Promise<ExpenseOut> {
    const expense = await this._expenseRepository.findOne({
      where: { id: expenseId },
    });
    if (!expense) {
      throw new HttpErrors.NotFound('Expense not found');
    }
    await this._groupsService.assertMember(expense.group.id, userId);
    return toExpenseDto(expense);
  }

  async create(
    groupId: string,
    userId: string,
    input: CreateExpenseInput
  ): Promise<ExpenseOut> {
    const group = await this._groupsService.assertMember(groupId, userId);

    const totalCents = Math.round(input.amount * 100);
    const participantIds = input.splits.map((s) => s.userId);
    await this.assertUsersAreMembers(groupId, [
      input.paidByUserId,
      ...participantIds,
    ]);

    const shares = this.computeShares(totalCents, input.splitType, input.splits);

    const creator = await this._usersService.findEntityById(userId);

    const expense = this._expenseRepository.create({
      group,
      description: input.description,
      amountCents: totalCents,
      currency: input.currency || group.currency,
      category: input.category,
      paidBy: { id: input.paidByUserId } as any,
      createdBy: creator ?? undefined,
      splitType: input.splitType,
      date: input.date ? new Date(input.date) : new Date(),
      splits: shares.map(
        (share) =>
          ({
            user: { id: share.userId } as any,
            amountCents: share.amountCents,
          } as ExpenseSplit)
      ),
    });

    const saved = await this._expenseRepository.save(expense);
    return this.getById(saved.id, userId);
  }

  async update(
    expenseId: string,
    userId: string,
    input: CreateExpenseInput
  ): Promise<ExpenseOut> {
    const existing = await this._expenseRepository.findOne({
      where: { id: expenseId },
    });
    if (!existing) {
      throw new HttpErrors.NotFound('Expense not found');
    }
    const groupId = existing.group.id;
    await this._groupsService.assertMember(groupId, userId);

    const totalCents = Math.round(input.amount * 100);
    const participantIds = input.splits.map((s) => s.userId);
    await this.assertUsersAreMembers(groupId, [
      input.paidByUserId,
      ...participantIds,
    ]);
    const shares = this.computeShares(totalCents, input.splitType, input.splits);

    existing.description = input.description;
    existing.amountCents = totalCents;
    existing.currency = input.currency || existing.currency;
    existing.category = input.category;
    existing.paidBy = { id: input.paidByUserId } as any;
    existing.splitType = input.splitType;
    existing.date = input.date ? new Date(input.date) : existing.date;
    // Replacing splits: orphaned rows are removed via cascade + orphan handling.
    existing.splits = shares.map(
      (share) =>
        ({
          user: { id: share.userId } as any,
          amountCents: share.amountCents,
        } as ExpenseSplit)
    );

    const saved = await this._expenseRepository.save(existing);
    return this.getById(saved.id, userId);
  }

  async remove(expenseId: string, userId: string) {
    const expense = await this._expenseRepository.findOne({
      where: { id: expenseId },
    });
    if (!expense) {
      throw new HttpErrors.NotFound('Expense not found');
    }
    await this._groupsService.assertMember(expense.group.id, userId);
    await this._expenseRepository.delete(expenseId);
    return { success: true };
  }

  /** Recent expenses across all of the user's groups. */
  async activityForUser(userId: string, limit = 30) {
    const memberships = await this._memberRepository.find({
      where: { user: { id: userId } },
      relations: { group: true },
    });
    const groupIds = memberships.map((m) => m.group.id);
    if (groupIds.length === 0) return [];

    const expenses = await this._expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.group', 'group')
      .leftJoinAndSelect('expense.paidBy', 'paidBy')
      .leftJoinAndSelect('expense.splits', 'splits')
      .leftJoinAndSelect('splits.user', 'splitUser')
      .where('group.id IN (:...groupIds)', { groupIds })
      .orderBy('expense.date', 'DESC')
      .addOrderBy('expense.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return expenses.map((expense) => ({
      expense: toExpenseDto(expense),
      groupName: expense.group.name,
    }));
  }
}
