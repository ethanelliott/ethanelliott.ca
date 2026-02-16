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

    // Update linked transfer if provided
    if (update.linkedTransferId !== undefined) {
      if (update.linkedTransferId === null) {
        // Unlink — also clear the other side
        if (transaction.linkedTransferId) {
          await this._repository.update(
            { id: transaction.linkedTransferId },
            { linkedTransferId: undefined, linkedTransferConfidence: undefined }
          );
        }
        transaction.linkedTransferId = undefined;
        transaction.linkedTransferConfidence = undefined;
      } else {
        transaction.linkedTransferId = update.linkedTransferId;
      }
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
    linkedTransferCount: number;
    unlinkedTransferCount: number;
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

    const transfers = transactions.filter(
      (t) => t.type === TransactionType.TRANSFER
    );
    const totalTransfers = transfers.reduce(
      (sum, t) => sum + Math.abs(t.amount),
      0
    );
    const linkedTransferCount = transfers.filter(
      (t) => t.linkedTransferId
    ).length;
    const unlinkedTransferCount = transfers.filter(
      (t) => !t.linkedTransferId
    ).length;

    // Group by category (exclude linked transfers from spending breakdown)
    const categoryMap = new Map<string, { amount: number; count: number }>();
    for (const t of transactions.filter(
      (t) =>
        t.type === TransactionType.EXPENSE ||
        (t.type === TransactionType.TRANSFER && !t.linkedTransferId)
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
      linkedTransferCount,
      unlinkedTransferCount,
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

  /**
   * Manually link two transactions as a transfer pair
   */
  async linkTransfer(
    transactionId: string,
    targetTransactionId: string,
    userId: string
  ): Promise<TransactionOut> {
    if (transactionId === targetTransactionId) {
      throw new HttpErrors.BadRequest('Cannot link a transaction to itself');
    }

    const [source, target] = await Promise.all([
      this._repository.findOne({
        where: { id: transactionId, user: { id: userId } },
        relations: { account: { plaidItem: true }, category: true, tags: true },
      }),
      this._repository.findOne({
        where: { id: targetTransactionId, user: { id: userId } },
        relations: { account: { plaidItem: true }, category: true, tags: true },
      }),
    ]);

    if (!source) throw new HttpErrors.NotFound('Source transaction not found');
    if (!target) throw new HttpErrors.NotFound('Target transaction not found');

    // If either already has a different link, clear the old link first
    if (source.linkedTransferId && source.linkedTransferId !== target.id) {
      await this._repository.update(
        { id: source.linkedTransferId },
        { linkedTransferId: undefined, linkedTransferConfidence: undefined }
      );
    }
    if (target.linkedTransferId && target.linkedTransferId !== source.id) {
      await this._repository.update(
        { id: target.linkedTransferId },
        { linkedTransferId: undefined, linkedTransferConfidence: undefined }
      );
    }

    // Link bidirectionally with 100% confidence (manual)
    source.linkedTransferId = target.id;
    source.linkedTransferConfidence = 100;
    source.type = TransactionType.TRANSFER;
    target.linkedTransferId = source.id;
    target.linkedTransferConfidence = 100;
    target.type = TransactionType.TRANSFER;
    await this._repository.save([source, target]);

    const reloaded = await this._repository.findOne({
      where: { id: source.id },
      relations: { account: { plaidItem: true }, category: true, tags: true },
    });
    return this.mapToOut(reloaded!);
  }

  /**
   * Unlink a transfer pair
   */
  async unlinkTransfer(
    transactionId: string,
    userId: string
  ): Promise<TransactionOut> {
    const transaction = await this._repository.findOne({
      where: { id: transactionId, user: { id: userId } },
      relations: { account: { plaidItem: true }, category: true, tags: true },
    });

    if (!transaction) {
      throw new HttpErrors.NotFound('Transaction not found');
    }

    if (transaction.linkedTransferId) {
      // Clear the other side
      await this._repository.update(
        { id: transaction.linkedTransferId },
        { linkedTransferId: undefined, linkedTransferConfidence: undefined }
      );
    }

    transaction.linkedTransferId = undefined;
    transaction.linkedTransferConfidence = undefined;
    const saved = await this._repository.save(transaction);

    const reloaded = await this._repository.findOne({
      where: { id: saved.id },
      relations: { account: { plaidItem: true }, category: true, tags: true },
    });
    return this.mapToOut(reloaded!);
  }

  /**
   * Get transfer suggestions for a transaction.
   * Returns candidate transactions ranked by confidence score.
   */
  async getTransferSuggestions(
    transactionId: string,
    userId: string
  ): Promise<Array<TransactionOut & { confidence: number }>> {
    const transaction = await this._repository.findOne({
      where: { id: transactionId, user: { id: userId } },
      relations: { account: true },
    });

    if (!transaction) {
      throw new HttpErrors.NotFound('Transaction not found');
    }

    const txAmount = parseFloat(transaction.amount.toString());
    const txDate = transaction.date;

    // Search for candidates: opposite polarity, different account, within ±5 days
    const dateParts = txDate.split('-').map(Number);
    const baseDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const minDate = new Date(baseDate);
    minDate.setDate(minDate.getDate() - 5);
    const maxDate = new Date(baseDate);
    maxDate.setDate(maxDate.getDate() + 5);
    const minDateStr = minDate.toISOString().split('T')[0];
    const maxDateStr = maxDate.toISOString().split('T')[0];

    const candidates = await this._repository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.account', 'account')
      .leftJoinAndSelect('account.plaidItem', 'plaidItem')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.tags', 'tags')
      .where('t.user.id = :userId', { userId })
      .andWhere('t.id != :txnId', { txnId: transaction.id })
      .andWhere('account.id != :accountId', {
        accountId: transaction.account.id,
      })
      .andWhere('t.date >= :minDate', { minDate: minDateStr })
      .andWhere('t.date <= :maxDate', { maxDate: maxDateStr })
      .andWhere('t.pending = :pending', { pending: false })
      .getMany();

    // Score each candidate
    const scored = candidates
      .map((c) => {
        const cAmount = parseFloat(c.amount.toString());
        const confidence = this.computeTransferConfidence(
          txAmount,
          txDate,
          transaction.account.id,
          cAmount,
          c.date,
          c.account?.id || '',
          transaction.name,
          c.name
        );
        return { transaction: c, confidence };
      })
      .filter((s) => s.confidence > 20) // minimum threshold
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    return scored.map((s) => ({
      ...this.mapToOut(s.transaction),
      confidence: s.confidence,
    }));
  }

  /**
   * Compute confidence score (0-100) that two transactions are a transfer pair
   */
  private computeTransferConfidence(
    amountA: number,
    dateA: string,
    accountIdA: string,
    amountB: number,
    dateB: string,
    accountIdB: string,
    nameA: string,
    nameB: string
  ): number {
    // Must be different accounts
    if (accountIdA === accountIdB) return 0;

    let score = 0;

    // Amount matching: opposite polarity, same absolute value
    const sumAmount = amountA + amountB;
    const absA = Math.abs(amountA);
    if (Math.abs(sumAmount) < 0.02) {
      // Exact opposite amounts
      score += 50;
    } else if (absA > 0 && Math.abs(sumAmount) / absA < 0.01) {
      // Within 1% tolerance
      score += 40;
    } else if (absA > 0 && Math.abs(sumAmount) / absA < 0.05) {
      // Within 5%
      score += 20;
    } else {
      // Amounts don't match well enough
      return 0;
    }

    // Date proximity
    const dateAMs = new Date(dateA).getTime();
    const dateBMs = new Date(dateB).getTime();
    const daysDiff = Math.abs(dateAMs - dateBMs) / (1000 * 60 * 60 * 24);
    if (daysDiff === 0) {
      score += 30;
    } else if (daysDiff <= 1) {
      score += 25;
    } else if (daysDiff <= 2) {
      score += 20;
    } else if (daysDiff <= 3) {
      score += 15;
    } else if (daysDiff <= 5) {
      score += 5;
    }

    // Name signals (transfer keywords in either transaction)
    const transferKeywords = [
      'transfer',
      'e-transfer',
      'payment',
      'pymt',
      'bill pay',
      'online banking',
      'internet banking',
    ];
    const nameALower = nameA.toLowerCase();
    const nameBLower = nameB.toLowerCase();
    for (const kw of transferKeywords) {
      if (nameALower.includes(kw) || nameBLower.includes(kw)) {
        score += 10;
        break;
      }
    }

    // Cap at 100
    return Math.min(score, 100);
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
      linkedTransferConfidence: transaction.linkedTransferConfidence ?? null,
      paymentChannel: transaction.paymentChannel || null,
      locationCity: transaction.locationCity || null,
      locationRegion: transaction.locationRegion || null,
      isoCurrencyCode: transaction.isoCurrencyCode,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
