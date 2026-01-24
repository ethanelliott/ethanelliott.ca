import { inject } from '@ee/di';
import { Database } from '../data-source';
import { Account } from './account.entity';
import { Transaction, TransactionType } from './transaction.entity';

export interface NetWorthSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  accountBreakdown: Array<{
    accountId: string;
    accountName: string;
    institutionName: string | null;
    type: string;
    balance: number;
    isAsset: boolean;
  }>;
}

export interface SpendingSummary {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  byCategory: Array<{
    category: string;
    amount: number;
    count: number;
    percentage: number;
  }>;
  byDay: Array<{
    date: string;
    income: number;
    expenses: number;
  }>;
}

export interface DashboardSummary {
  netWorth: NetWorthSummary;
  spending: SpendingSummary;
  unreviewedCount: number;
  pendingCount: number;
  lastSyncAt: Date | null;
  connectedBanks: number;
}

export class OverviewService {
  private readonly _accountRepository = inject(Database).repositoryFor(Account);
  private readonly _transactionRepository =
    inject(Database).repositoryFor(Transaction);

  /**
   * Get net worth summary
   */
  async getNetWorth(userId: string): Promise<NetWorthSummary> {
    const accounts = await this._accountRepository.find({
      where: { user: { id: userId }, isVisible: true },
      relations: { plaidItem: true },
    });

    let totalAssets = 0;
    let totalLiabilities = 0;
    const breakdown: NetWorthSummary['accountBreakdown'] = [];

    for (const account of accounts) {
      const balance = account.currentBalance || 0;
      const isAsset = !['credit', 'loan'].includes(account.type);

      if (isAsset) {
        totalAssets += balance;
      } else {
        // For credit/loan, balance is typically positive but represents debt
        totalLiabilities += Math.abs(balance);
      }

      breakdown.push({
        accountId: account.id,
        accountName: account.name,
        institutionName: account.plaidItem?.institutionName || null,
        type: account.type,
        balance,
        isAsset,
      });
    }

    return {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      accountBreakdown: breakdown.sort(
        (a, b) => Math.abs(b.balance) - Math.abs(a.balance)
      ),
    };
  }

  /**
   * Get spending summary for a date range
   */
  async getSpending(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<SpendingSummary> {
    const transactions = await this._transactionRepository.find({
      where: {
        user: { id: userId },
        pending: false,
      },
      relations: { category: true },
      order: { date: 'ASC' },
    });

    // Filter by date range
    const filtered = transactions.filter(
      (t) => t.date >= startDate && t.date <= endDate
    );

    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryMap = new Map<string, { amount: number; count: number }>();
    const dayMap = new Map<string, { income: number; expenses: number }>();

    for (const txn of filtered) {
      const amount = Math.abs(parseFloat(txn.amount.toString()));

      if (txn.type === TransactionType.INCOME) {
        totalIncome += amount;
        if (!dayMap.has(txn.date)) {
          dayMap.set(txn.date, { income: 0, expenses: 0 });
        }
        dayMap.get(txn.date)!.income += amount;
      } else if (txn.type === TransactionType.EXPENSE) {
        totalExpenses += amount;
        if (!dayMap.has(txn.date)) {
          dayMap.set(txn.date, { income: 0, expenses: 0 });
        }
        dayMap.get(txn.date)!.expenses += amount;

        // Track by category
        const cat =
          txn.category?.name ||
          txn.plaidPersonalFinanceCategory ||
          'Uncategorized';
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { amount: 0, count: 0 });
        }
        const catEntry = categoryMap.get(cat)!;
        catEntry.amount += amount;
        catEntry.count++;
      }
    }

    const byCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percentage: totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const byDay = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalIncome,
      totalExpenses,
      netCashFlow: totalIncome - totalExpenses,
      byCategory,
      byDay,
    };
  }

  /**
   * Get dashboard summary
   */
  async getDashboard(userId: string): Promise<DashboardSummary> {
    // Get current month date range
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    const [netWorth, spending, unreviewedCount, pendingCount, accounts] =
      await Promise.all([
        this.getNetWorth(userId),
        this.getSpending(userId, startOfMonth, endOfMonth),
        this._transactionRepository.count({
          where: { user: { id: userId }, isReviewed: false, pending: false },
        }),
        this._transactionRepository.count({
          where: { user: { id: userId }, pending: true },
        }),
        this._accountRepository.find({
          where: { user: { id: userId } },
          relations: { plaidItem: true },
        }),
      ]);

    // Get unique connected banks
    const uniqueBanks = new Set(
      accounts.map((a) => a.plaidItem?.id).filter(Boolean)
    );

    // Get last sync time
    const lastSync = accounts
      .map((a) => a.plaidItem?.lastSyncAt)
      .filter(Boolean)
      .sort((a, b) => b!.getTime() - a!.getTime())[0];

    return {
      netWorth,
      spending,
      unreviewedCount,
      pendingCount,
      lastSyncAt: lastSync || null,
      connectedBanks: uniqueBanks.size,
    };
  }

  /**
   * Get monthly summary for trends
   */
  async getMonthlyTrends(
    userId: string,
    months: number = 6
  ): Promise<
    Array<{
      month: string;
      income: number;
      expenses: number;
      netCashFlow: number;
    }>
  > {
    const results: Array<{
      month: string;
      income: number;
      expenses: number;
      netCashFlow: number;
    }> = [];

    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startDate = date.toISOString().split('T')[0];
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];

      const spending = await this.getSpending(userId, startDate, endDate);

      results.push({
        month: date.toISOString().slice(0, 7), // YYYY-MM format
        income: spending.totalIncome,
        expenses: spending.totalExpenses,
        netCashFlow: spending.netCashFlow,
      });
    }

    return results;
  }
}
