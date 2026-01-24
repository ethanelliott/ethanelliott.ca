import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import {
  Transaction,
  TransactionOut,
  TransactionUpdate,
  TransactionType,
} from './transaction.entity';
import { Category } from './category.entity';
import { Tag } from './tag.entity';
import {
  In,
  Between,
  IsNull,
  Not,
  LessThanOrEqual,
  MoreThanOrEqual,
} from 'typeorm';

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  isReviewed?: boolean;
  isPending?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
  hasLinkedTransfer?: boolean;
}

export class TransactionsService {
  private readonly _repository = inject(Database).repositoryFor(Transaction);
  private readonly _categoryRepository =
    inject(Database).repositoryFor(Category);
  private readonly _tagRepository = inject(Database).repositoryFor(Tag);

  /**
   * Get all transactions for a user with optional filters
   */
  async getAll(
    userId: string,
    filters: TransactionFilters = {}
  ): Promise<TransactionOut[]> {
    const queryBuilder = this._repository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.account', 'account')
      .leftJoinAndSelect('account.plaidItem', 'plaidItem')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.tags', 'tags')
      .where('t.user.id = :userId', { userId })
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.createdAt', 'DESC');

    if (filters.accountId) {
      queryBuilder.andWhere('account.id = :accountId', {
        accountId: filters.accountId,
      });
    }

    if (filters.categoryId) {
      queryBuilder.andWhere('category.id = :categoryId', {
        categoryId: filters.categoryId,
      });
    }

    if (filters.type) {
      queryBuilder.andWhere('t.type = :type', { type: filters.type });
    }

    if (filters.isReviewed !== undefined) {
      queryBuilder.andWhere('t.isReviewed = :isReviewed', {
        isReviewed: filters.isReviewed,
      });
    }

    if (filters.isPending !== undefined) {
      queryBuilder.andWhere('t.pending = :pending', {
        pending: filters.isPending,
      });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('t.date >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('t.date <= :endDate', { endDate: filters.endDate });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(t.name LIKE :search OR t.merchantName LIKE :search OR t.notes LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.hasLinkedTransfer !== undefined) {
      if (filters.hasLinkedTransfer) {
        queryBuilder.andWhere('t.linkedTransferId IS NOT NULL');
      } else {
        queryBuilder.andWhere('t.linkedTransferId IS NULL');
      }
    }

    const transactions = await queryBuilder.getMany();
    return transactions.map((t) => this.mapToOut(t));
  }

  /**
   * Get unreviewed transactions (inbox)
   */
  async getUnreviewed(userId: string): Promise<TransactionOut[]> {
    return this.getAll(userId, { isReviewed: false, isPending: false });
  }

  /**
   * Get transaction by ID
   */
  async getById(
    transactionId: string,
    userId: string
  ): Promise<TransactionOut> {
    const transaction = await this._repository.findOne({
      where: { id: transactionId, user: { id: userId } },
      relations: {
        account: { plaidItem: true },
        category: true,
        tags: true,
      },
    });

    if (!transaction) {
      throw new HttpErrors.NotFound('Transaction not found');
    }

    return this.mapToOut(transaction);
  }

  /**
   * Update a transaction (category, tags, notes, reviewed status)
   */
  async update(
    transactionId: string,
    update: TransactionUpdate,
    userId: string
  ): Promise<TransactionOut> {
    const transaction = await this._repository.findOne({
      where: { id: transactionId, user: { id: userId } },
      relations: {
        account: { plaidItem: true },
        category: true,
        tags: true,
      },
    });

    if (!transaction) {
      throw new HttpErrors.NotFound('Transaction not found');
    }

    // Update category if provided
    if (update.category !== undefined) {
      if (update.category === null) {
        transaction.category = undefined;
      } else {
        // Find or create category
        let category = await this._categoryRepository.findOne({
          where: { name: update.category, user: { id: userId } },
        });

        if (!category) {
          category = this._categoryRepository.create({
            name: update.category,
            user: { id: userId } as any,
          });
          category = await this._categoryRepository.save(category);
        }

        transaction.category = category;
      }
    }

    // Update tags if provided
    if (update.tags !== undefined) {
      const tags: Tag[] = [];
      for (const tagName of update.tags) {
        let tag = await this._tagRepository.findOne({
          where: { name: tagName, user: { id: userId } },
        });

        if (!tag) {
          tag = this._tagRepository.create({
            name: tagName,
            user: { id: userId } as any,
          });
          tag = await this._tagRepository.save(tag);
        }

        tags.push(tag);
      }
      transaction.tags = tags;
    }

    // Update notes if provided
    if (update.notes !== undefined) {
      transaction.notes = update.notes || undefined;
    }

    // Update reviewed status if provided
    if (update.isReviewed !== undefined) {
      transaction.isReviewed = update.isReviewed;
    }

    const saved = await this._repository.save(transaction);

    // Reload with relations
    const reloaded = await this._repository.findOne({
      where: { id: saved.id },
      relations: {
        account: { plaidItem: true },
        category: true,
        tags: true,
      },
    });

    return this.mapToOut(reloaded!);
  }

  /**
   * Bulk review transactions
   */
  async bulkReview(
    transactionIds: string[],
    update: Partial<TransactionUpdate>,
    userId: string
  ): Promise<number> {
    let updatedCount = 0;

    for (const id of transactionIds) {
      try {
        await this.update(id, { ...update, isReviewed: true }, userId);
        updatedCount++;
      } catch (error) {
        console.warn(`Failed to update transaction ${id}:`, error);
      }
    }

    return updatedCount;
  }

  /**
   * Mark transaction as reviewed
   */
  async markReviewed(
    transactionId: string,
    userId: string
  ): Promise<TransactionOut> {
    return this.update(transactionId, { isReviewed: true }, userId);
  }

  /**
   * Mark multiple transactions as reviewed
   */
  async markMultipleReviewed(
    transactionIds: string[],
    userId: string
  ): Promise<number> {
    const result = await this._repository.update(
      {
        id: In(transactionIds),
        user: { id: userId },
      },
      { isReviewed: true }
    );

    return result.affected || 0;
  }

  /**
   * Get transaction statistics
   */
  async getStats(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    totalTransactions: number;
    unreviewedCount: number;
    totalIncome: number;
    totalExpenses: number;
    totalTransfers: number;
    byCategory: Array<{ category: string; amount: number; count: number }>;
  }> {
    const filters: TransactionFilters = { isPending: false };
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const transactions = await this.getAll(userId, filters);

    const unreviewedCount = transactions.filter((t) => !t.isReviewed).length;
    const totalIncome = transactions
      .filter((t) => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalExpenses = transactions
      .filter((t) => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalTransfers = transactions
      .filter((t) => t.type === TransactionType.TRANSFER)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Group by category
    const categoryMap = new Map<string, { amount: number; count: number }>();
    for (const t of transactions.filter(
      (t) => t.type === TransactionType.EXPENSE
    )) {
      const cat =
        t.category || t.plaidPersonalFinanceCategory || 'Uncategorized';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { amount: 0, count: 0 });
      }
      const entry = categoryMap.get(cat)!;
      entry.amount += Math.abs(t.amount);
      entry.count++;
    }

    const byCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalTransactions: transactions.length,
      unreviewedCount,
      totalIncome,
      totalExpenses,
      totalTransfers,
      byCategory,
    };
  }

  /**
   * Get linked transfer transaction
   */
  async getLinkedTransfer(
    transactionId: string,
    userId: string
  ): Promise<TransactionOut | null> {
    const transaction = await this._repository.findOne({
      where: { id: transactionId, user: { id: userId } },
    });

    if (!transaction || !transaction.linkedTransferId) {
      return null;
    }

    const linked = await this._repository.findOne({
      where: { id: transaction.linkedTransferId, user: { id: userId } },
      relations: {
        account: { plaidItem: true },
        category: true,
        tags: true,
      },
    });

    return linked ? this.mapToOut(linked) : null;
  }

  private mapToOut(transaction: Transaction): TransactionOut {
    return {
      id: transaction.id,
      plaidTransactionId: transaction.plaidTransactionId,
      accountId: transaction.account?.id || '',
      accountName: transaction.account?.name || '',
      institutionName: transaction.account?.plaidItem?.institutionName || null,
      date: transaction.date,
      authorizedDate: transaction.authorizedDate || null,
      amount: parseFloat(transaction.amount.toString()),
      type: transaction.type,
      name: transaction.name,
      merchantName: transaction.merchantName || null,
      plaidCategory: transaction.plaidCategory || null,
      plaidPersonalFinanceCategory:
        transaction.plaidPersonalFinanceCategory || null,
      category: transaction.category?.name || null,
      categoryColor: transaction.category?.color || null,
      tags: transaction.tags?.map((t) => t.name) || [],
      notes: transaction.notes || null,
      pending: transaction.pending,
      isReviewed: transaction.isReviewed,
      linkedTransferId: transaction.linkedTransferId || null,
      paymentChannel: transaction.paymentChannel || null,
      locationCity: transaction.locationCity || null,
      locationRegion: transaction.locationRegion || null,
      isoCurrencyCode: transaction.isoCurrencyCode,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
