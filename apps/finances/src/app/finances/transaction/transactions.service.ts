import { inject } from '@ee/di';
import { Database } from '../../data-source';
import { Transaction, TransactionIn } from './transaction';
import { TagsService } from '../tags/tags.service';
import { CategoriesService } from '../categories/categories.service';
import { AccountsService } from '../accounts/accounts.service';
import HttpError from 'http-errors';

export class TransactionsService {
  private readonly _repository = inject(Database).repositoryFor(Transaction);
  private readonly _tagsService = inject(TagsService);
  private readonly _categoriesService = inject(CategoriesService);
  private readonly _accountsService = inject(AccountsService);

  async all(userId: string) {
    const transactions = await this._repository.find({
      where: { user: { id: userId } },
      relations: {
        account: true,
        category: true,
        tags: true,
      },
      order: { date: 'DESC', timestamp: 'DESC' },
    });

    return transactions.map((transaction) => {
      return {
        ...transaction,
        account: {
          id: transaction.account.id,
          name: transaction.account.name,
        },
        category: transaction.category.name,
        tags: transaction.tags.map((tag) => tag.name),
      };
    });
  }

  async new(transaction: TransactionIn, userId: string) {
    // Validate account exists and belongs to user
    const account = await this._accountsService.get(
      transaction.account,
      userId
    );

    const tags = transaction?.tags
      ? await Promise.all(
          transaction.tags.map((tag) =>
            this._tagsService.new({ name: tag, isActive: true }, userId)
          )
        )
      : [];

    const category = await this._categoriesService.new(
      {
        name: transaction.category,
      },
      userId
    );

    const savedTransaction = await this._repository.save({
      ...transaction,
      user: { id: userId } as any,
      account,
      category,
      tags: tags,
    });

    return {
      ...savedTransaction,
      account: {
        id: savedTransaction.account.id,
        name: savedTransaction.account.name,
      },
      category: savedTransaction.category.name,
      tags: savedTransaction.tags.map((tag) => tag.name),
    };
  }

  async findById(id: string, userId: string) {
    const transaction = await this._repository.findOne({
      where: { id, user: { id: userId } },
      relations: {
        account: true,
        category: true,
        tags: true,
      },
    });

    if (!transaction) {
      return null;
    }

    return {
      ...transaction,
      account: {
        id: transaction.account.id,
        name: transaction.account.name,
      },
      category: transaction.category.name,
      tags: transaction.tags.map((tag) => tag.name),
    };
  }

  async update(id: string, transaction: TransactionIn, userId: string) {
    const existing = await this._repository.findOne({
      where: { id, user: { id: userId } },
      relations: {
        account: true,
        category: true,
        tags: true,
      },
    });

    if (!existing) {
      throw new HttpError.NotFound(`Transaction with id "${id}" not found.`);
    }

    // Validate account exists and belongs to user
    const account = await this._accountsService.get(
      transaction.account,
      userId
    );

    const tags = transaction?.tags
      ? await Promise.all(
          transaction.tags.map((tag) =>
            this._tagsService.new({ name: tag, isActive: true }, userId)
          )
        )
      : [];

    const category = await this._categoriesService.new(
      {
        name: transaction.category,
      },
      userId
    );

    // Update the existing entity properties
    existing.type = transaction.type;
    existing.account = account;
    existing.amount = transaction.amount;
    existing.date = transaction.date;
    existing.description = transaction.description;
    existing.category = category;
    existing.tags = tags;

    // Save the updated entity (this handles many-to-many relationships correctly)
    await this._repository.save(existing);

    return this.findById(id, userId);
  }

  async deleteById(id: string, userId: string) {
    const transaction = await this._repository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!transaction) {
      return false;
    }

    await this._repository.remove(transaction);
    return true;
  }

  async deleteAll(userId: string) {
    const result = await this._repository.delete({ user: { id: userId } });
    return {
      success: true,
      deletedCount: result.affected || 0,
    };
  }

  /**
   * Get transaction count for a specific account
   */
  async getAccountTransactionCount(accountId: string): Promise<number> {
    return this._repository.count({
      where: { account: { id: accountId } },
    });
  }

  /**
   * Get transactions for a specific account
   */
  async getAccountTransactions(accountId: string, userId: string) {
    return this._repository.find({
      where: { account: { id: accountId }, user: { id: userId } },
      relations: {
        account: true,
        category: true,
        tags: true,
      },
      order: { date: 'DESC', timestamp: 'DESC' },
    });
  }

  /**
   * Calculate account balance from transactions
   */
  async calculateAccountBalance(accountId: string, userId: string) {
    const queryBuilder = this._repository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.account', 'account')
      .leftJoin('transaction.user', 'user')
      .where('account.id = :accountId', { accountId })
      .andWhere('user.id = :userId', { userId });

    const income = await queryBuilder
      .clone()
      .andWhere('transaction.type = :type', { type: 'INCOME' })
      .select('COALESCE(SUM(transaction.amount), 0)', 'total')
      .getRawOne();

    const expenses = await queryBuilder
      .clone()
      .andWhere('transaction.type = :type', { type: 'EXPENSE' })
      .select('COALESCE(SUM(transaction.amount), 0)', 'total')
      .getRawOne();

    const totalIncome = parseFloat(income.total) || 0;
    const totalExpenses = parseFloat(expenses.total) || 0;

    return {
      totalIncome,
      totalExpenses,
      currentBalance: totalIncome - totalExpenses,
    };
  }

  /**
   * Get transaction summary for a user
   */
  async getUserTransactionSummary(
    userId: string,
    startDate?: string,
    endDate?: string
  ) {
    const queryBuilder = this._repository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .where('user.id = :userId', { userId });

    if (startDate) {
      queryBuilder.andWhere('transaction.date >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('transaction.date <= :endDate', { endDate });
    }

    const transactions = await queryBuilder.getMany();

    const summary = {
      totalTransactions: transactions.length,
      totalIncome: 0,
      totalExpenses: 0,
      netAmount: 0,
      byCategory: {} as Record<
        string,
        { income: number; expenses: number; count: number }
      >,
      byAccount: {} as Record<
        string,
        { income: number; expenses: number; count: number }
      >,
    };

    for (const transaction of transactions) {
      if (transaction.type === 'INCOME') {
        summary.totalIncome += transaction.amount;
      } else {
        summary.totalExpenses += transaction.amount;
      }

      // Category breakdown
      const categoryKey = transaction.category?.name || 'Uncategorized';
      if (!summary.byCategory[categoryKey]) {
        summary.byCategory[categoryKey] = { income: 0, expenses: 0, count: 0 };
      }
      if (transaction.type === 'INCOME') {
        summary.byCategory[categoryKey].income += transaction.amount;
      } else {
        summary.byCategory[categoryKey].expenses += transaction.amount;
      }
      summary.byCategory[categoryKey].count++;

      // Account breakdown
      const accountKey = transaction.account.id;
      if (!summary.byAccount[accountKey]) {
        summary.byAccount[accountKey] = { income: 0, expenses: 0, count: 0 };
      }
      if (transaction.type === 'INCOME') {
        summary.byAccount[accountKey].income += transaction.amount;
      } else {
        summary.byAccount[accountKey].expenses += transaction.amount;
      }
      summary.byAccount[accountKey].count++;
    }

    summary.netAmount = summary.totalIncome - summary.totalExpenses;

    return summary;
  }
}
