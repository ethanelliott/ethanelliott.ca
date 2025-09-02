import { inject } from '@ee/di';
import { Database } from '../../data-source';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transaction/transactions.service';
import { TransfersService } from '../transfers/transfers.service';
import { Account } from '../accounts/account';
import { Transaction } from '../transaction/transaction';
import { Transfer } from '../transfers/transfer';

interface AccountBalance {
  accountId: string;
  accountName: string;
  initialBalance: number;
  currentBalance: number;
  totalIncome: number;
  totalExpenses: number;
  transfersIn: number;
  transfersOut: number;
}

interface MonthlyBreakdown {
  month: string;
  year: number;
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  transferVolume: number;
  transactionCount: number;
  transferCount: number;
  netWorthChange: number;
}

interface CategoryInsight {
  category: string;
  totalSpent: number;
  transactionCount: number;
  averageTransaction: number;
  monthlyTrend: 'increasing' | 'decreasing' | 'stable';
  percentOfTotalExpenses: number;
}

interface AllTimeOverview {
  // Net Worth Data
  currentNetWorth: number;
  totalAccountBalance: number;

  // Cash Flow Data
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;

  // Transfer Data
  totalTransferVolume: number;

  // Account Summary
  accountCount: number;
  accountBalances: AccountBalance[];

  // Transaction Summary
  transactionCount: number;
  transferCount: number;

  // Time Range
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
  daysSinceFirstTransaction: number;

  // Top Categories
  topExpenseCategories: CategoryInsight[];

  // Monthly Trends (last 12 months)
  monthlyBreakdowns: MonthlyBreakdown[];

  // Financial Health Metrics
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  expenseToIncomeRatio: number;
  savingsRate: number;
}

interface MonthlyHabitsOverview {
  month: number;
  year: number;

  // Cash Flow
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;

  // Transfers
  totalTransferVolume: number;
  transfersIn: number;
  transfersOut: number;

  // Transaction Patterns
  transactionCount: number;
  transferCount: number;
  averageTransactionSize: number;

  // Daily Patterns
  dailyBreakdown: {
    day: number;
    income: number;
    expenses: number;
    transfers: number;
  }[];

  // Weekly Patterns
  weeklyBreakdown: {
    week: number;
    income: number;
    expenses: number;
    transfers: number;
  }[];

  // Category Breakdown
  categoryBreakdown: {
    category: string;
    amount: number;
    transactionCount: number;
    percentOfTotal: number;
  }[];

  // Account Activity
  accountActivity: {
    accountId: string;
    accountName: string;
    income: number;
    expenses: number;
    transfersIn: number;
    transfersOut: number;
    netChange: number;
  }[];

  // Comparison with Previous Month
  comparison: {
    incomeChange: number;
    expenseChange: number;
    netCashFlowChange: number;
    transactionCountChange: number;
  };
}

export class OverviewService {
  private readonly _accountsService = inject(AccountsService);
  private readonly _transactionsService = inject(TransactionsService);
  private readonly _transfersService = inject(TransfersService);
  private readonly _database = inject(Database);

  /**
   * Get comprehensive all-time financial overview
   */
  async getAllTimeOverview(userId: string): Promise<AllTimeOverview> {
    // Get raw entity data for calculations
    const [accounts, rawTransactions, rawTransfers] = await Promise.all([
      this._accountsService.all(userId),
      this.getRawTransactions(userId),
      this.getRawTransfers(userId),
    ]);

    // Calculate account balances with transfers
    const accountBalances = await this.calculateAccountBalances(
      userId,
      accounts,
      rawTransactions,
      rawTransfers
    );

    // Calculate current net worth (sum of all account balances)
    const currentNetWorth = accountBalances.reduce(
      (sum, acc) => sum + acc.currentBalance,
      0
    );
    const totalAccountBalance = currentNetWorth;

    // Calculate cash flow totals
    const totalIncome = rawTransactions
      .filter((t: Transaction) => t.type === 'INCOME')
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

    const totalExpenses = rawTransactions
      .filter((t: Transaction) => t.type === 'EXPENSE')
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

    const netCashFlow = totalIncome - totalExpenses;

    // Calculate transfer volume
    const totalTransferVolume = rawTransfers.reduce(
      (sum: number, t: Transfer) => sum + t.amount,
      0
    );

    // Calculate time range
    const allDates = [
      ...rawTransactions.map((t: Transaction) => new Date(t.date)),
      ...rawTransfers.map((t: Transfer) => new Date(t.date)),
    ].sort((a, b) => a.getTime() - b.getTime());

    const firstTransactionDate =
      allDates.length > 0 ? allDates[0].toISOString().split('T')[0] : null;
    const lastTransactionDate =
      allDates.length > 0
        ? allDates[allDates.length - 1].toISOString().split('T')[0]
        : null;
    const daysSinceFirstTransaction = firstTransactionDate
      ? Math.floor(
          (new Date().getTime() - new Date(firstTransactionDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    // Calculate category insights
    const topExpenseCategories =
      this.calculateCategoryInsights(rawTransactions);

    // Calculate monthly breakdowns
    const monthlyBreakdowns = await this.calculateMonthlyBreakdowns(
      userId,
      rawTransactions,
      rawTransfers,
      accounts
    );

    // Calculate financial health metrics
    const monthlyCount = monthlyBreakdowns.length || 1;
    const averageMonthlyIncome =
      monthlyBreakdowns.reduce((sum, m) => sum + m.totalIncome, 0) /
      monthlyCount;
    const averageMonthlyExpenses =
      monthlyBreakdowns.reduce((sum, m) => sum + m.totalExpenses, 0) /
      monthlyCount;
    const expenseToIncomeRatio =
      totalIncome > 0 ? totalExpenses / totalIncome : 0;
    const savingsRate =
      totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0;

    return {
      currentNetWorth,
      totalAccountBalance,
      totalIncome,
      totalExpenses,
      netCashFlow,
      totalTransferVolume,
      accountCount: accounts.length,
      accountBalances,
      transactionCount: rawTransactions.length,
      transferCount: rawTransfers.length,
      firstTransactionDate,
      lastTransactionDate,
      daysSinceFirstTransaction,
      topExpenseCategories,
      monthlyBreakdowns,
      averageMonthlyIncome,
      averageMonthlyExpenses,
      expenseToIncomeRatio,
      savingsRate,
    };
  }

  /**
   * Get raw transaction entities (not service DTOs)
   */
  private async getRawTransactions(userId: string): Promise<Transaction[]> {
    const repository = this._database.repositoryFor(Transaction);

    return repository.find({
      where: { user: { id: userId } },
      relations: {
        account: true,
        category: true,
        tags: true,
      },
      order: { date: 'DESC', timestamp: 'DESC' },
    });
  }

  /**
   * Get raw transfer entities (not service DTOs)
   */
  private async getRawTransfers(userId: string): Promise<Transfer[]> {
    const repository = this._database.repositoryFor(Transfer);

    return repository.find({
      where: { user: { id: userId } },
      relations: {
        fromAccount: true,
        toAccount: true,
        category: true,
      },
      order: { date: 'DESC', timestamp: 'DESC' },
    });
  }

  /**
   * Get comprehensive monthly habits overview
   */
  async getMonthlyHabitsOverview(
    userId: string,
    month: number,
    year: number
  ): Promise<MonthlyHabitsOverview> {
    // Filter data for the specific month
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const [rawTransactions, rawTransfers] = await Promise.all([
      this.getTransactionsForPeriod(userId, monthStart, monthEnd),
      this.getTransfersForPeriod(userId, monthStart, monthEnd),
    ]);

    // Calculate basic metrics
    const totalIncome = rawTransactions
      .filter((t: Transaction) => t.type === 'INCOME')
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

    const totalExpenses = rawTransactions
      .filter((t: Transaction) => t.type === 'EXPENSE')
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

    const netCashFlow = totalIncome - totalExpenses;

    const totalTransferVolume = rawTransfers.reduce(
      (sum: number, t: Transfer) => sum + t.amount,
      0
    );
    const transfersIn = rawTransfers.reduce(
      (sum: number, t: Transfer) => sum + t.amount,
      0
    ); // All transfers affect accounts
    const transfersOut = transfersIn; // Transfers are zero-sum

    const transactionCount = rawTransactions.length;
    const transferCount = rawTransfers.length;
    const averageTransactionSize =
      transactionCount > 0
        ? (totalIncome + totalExpenses) / transactionCount
        : 0;

    // Daily breakdown
    const dailyBreakdown = this.calculateDailyBreakdown(
      rawTransactions,
      rawTransfers,
      monthStart,
      monthEnd
    );

    // Weekly breakdown
    const weeklyBreakdown = this.calculateWeeklyBreakdown(
      rawTransactions,
      rawTransfers,
      monthStart,
      monthEnd
    );

    // Category breakdown
    const categoryBreakdown =
      this.calculateMonthlyCategoryBreakdown(rawTransactions);

    // Account activity
    const accountActivity = await this.calculateMonthlyAccountActivity(
      userId,
      rawTransactions,
      rawTransfers
    );

    // Comparison with previous month
    const previousMonth = month === 0 ? 11 : month - 1;
    const previousYear = month === 0 ? year - 1 : year;
    const comparison = await this.calculateMonthlyComparison(
      userId,
      month,
      year,
      previousMonth,
      previousYear
    );

    return {
      month,
      year,
      totalIncome,
      totalExpenses,
      netCashFlow,
      totalTransferVolume,
      transfersIn,
      transfersOut,
      transactionCount,
      transferCount,
      averageTransactionSize,
      dailyBreakdown,
      weeklyBreakdown,
      categoryBreakdown,
      accountActivity,
      comparison,
    };
  }

  /**
   * Calculate accurate account balances including transfers
   */
  private async calculateAccountBalances(
    userId: string,
    accounts: Account[],
    transactions: Transaction[],
    transfers: Transfer[]
  ): Promise<AccountBalance[]> {
    const balances: AccountBalance[] = [];

    for (const account of accounts) {
      const accountTransactions = transactions.filter(
        (t) => t.account.id === account.id
      );
      const incomingTransfers = transfers.filter(
        (t) => t.toAccount.id === account.id
      );
      const outgoingTransfers = transfers.filter(
        (t) => t.fromAccount.id === account.id
      );

      const totalIncome = accountTransactions
        .filter((t) => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalExpenses = accountTransactions
        .filter((t) => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);

      const transfersIn = incomingTransfers.reduce(
        (sum, t) => sum + t.amount,
        0
      );
      const transfersOut = outgoingTransfers.reduce(
        (sum, t) => sum + t.amount,
        0
      );

      const initialBalance = parseFloat(account.initialBalance.toString()) || 0;
      const currentBalance =
        initialBalance +
        totalIncome -
        totalExpenses +
        transfersIn -
        transfersOut;

      balances.push({
        accountId: account.id,
        accountName: account.name,
        initialBalance,
        currentBalance,
        totalIncome,
        totalExpenses,
        transfersIn,
        transfersOut,
      });
    }

    return balances;
  }

  /**
   * Calculate category insights with trends
   */
  private calculateCategoryInsights(
    transactions: Transaction[]
  ): CategoryInsight[] {
    const expenseTransactions = transactions.filter(
      (t: Transaction) => t.type === 'EXPENSE'
    );
    const totalExpenses = expenseTransactions.reduce(
      (sum: number, t: Transaction) => sum + t.amount,
      0
    );

    const categoryMap = new Map<
      string,
      { amount: number; count: number; dates: Date[] }
    >();

    expenseTransactions.forEach((t: Transaction) => {
      const category = t.category?.name || 'Uncategorized';
      const existing = categoryMap.get(category) || {
        amount: 0,
        count: 0,
        dates: [],
      };
      existing.amount += t.amount;
      existing.count++;
      existing.dates.push(new Date(t.date));
      categoryMap.set(category, existing);
    });

    return Array.from(categoryMap.entries())
      .map(([category, data]) => {
        const averageTransaction = data.amount / data.count;
        const percentOfTotalExpenses =
          totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0;

        // Simple trend calculation based on date distribution
        const sortedDates = data.dates.sort(
          (a, b) => a.getTime() - b.getTime()
        );
        const midpoint = Math.floor(sortedDates.length / 2);
        const firstHalf = sortedDates.slice(0, midpoint);
        const secondHalf = sortedDates.slice(midpoint);

        let monthlyTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
        if (secondHalf.length > firstHalf.length) {
          monthlyTrend = 'increasing';
        } else if (firstHalf.length > secondHalf.length) {
          monthlyTrend = 'decreasing';
        }

        return {
          category,
          totalSpent: data.amount,
          transactionCount: data.count,
          averageTransaction,
          monthlyTrend,
          percentOfTotalExpenses,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10); // Top 10 categories
  }

  /**
   * Calculate monthly breakdowns for trend analysis
   */
  private async calculateMonthlyBreakdowns(
    userId: string,
    transactions: Transaction[],
    transfers: Transfer[],
    accounts: Account[]
  ): Promise<MonthlyBreakdown[]> {
    const breakdowns: MonthlyBreakdown[] = [];
    const now = new Date();

    // Calculate for last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const monthTransactions = transactions.filter((t: Transaction) => {
        // Parse date parts to avoid timezone issues
        const dateParts = t.date.split('-');
        const transactionYear = parseInt(dateParts[0]);
        const transactionMonth = parseInt(dateParts[1]) - 1; // Convert to 0-indexed

        const monthYear = monthStart.getFullYear();
        const monthMonth = monthStart.getMonth();

        return transactionYear === monthYear && transactionMonth === monthMonth;
      });

      const monthTransfers = transfers.filter((t: Transfer) => {
        // Parse date parts to avoid timezone issues
        const dateParts = t.date.split('-');
        const transferYear = parseInt(dateParts[0]);
        const transferMonth = parseInt(dateParts[1]) - 1; // Convert to 0-indexed

        const monthYear = monthStart.getFullYear();
        const monthMonth = monthStart.getMonth();

        return transferYear === monthYear && transferMonth === monthMonth;
      });

      const totalIncome = monthTransactions
        .filter((t: Transaction) => t.type === 'INCOME')
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

      const totalExpenses = monthTransactions
        .filter((t: Transaction) => t.type === 'EXPENSE')
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

      const netCashFlow = totalIncome - totalExpenses;
      const transferVolume = monthTransfers.reduce(
        (sum: number, t: Transfer) => sum + t.amount,
        0
      );

      // Calculate net worth change - cash flow affects net worth directly
      // Transfers are zero-sum between accounts so don't change overall net worth
      const netWorthChange = netCashFlow;

      breakdowns.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
        year: monthStart.getFullYear(),
        totalIncome,
        totalExpenses,
        netCashFlow,
        transferVolume,
        transactionCount: monthTransactions.length,
        transferCount: monthTransfers.length,
        netWorthChange,
      });
    }

    return breakdowns;
  }

  /**
   * Get transactions for a specific period
   */
  private async getTransactionsForPeriod(
    userId: string,
    start: Date,
    end: Date
  ): Promise<Transaction[]> {
    const repository = this._database.repositoryFor(Transaction);

    return repository
      .find({
        where: {
          user: { id: userId },
        },
        relations: {
          account: true,
          category: true,
          tags: true,
        },
      })
      .then((transactions) =>
        transactions.filter((t) => {
          // Parse date parts to avoid timezone issues with 'YYYY-MM-DD' format
          const dateParts = t.date.split('-');
          const transactionYear = parseInt(dateParts[0]);
          const transactionMonth = parseInt(dateParts[1]) - 1; // Convert to 0-indexed
          const transactionDay = parseInt(dateParts[2]);

          const transactionDate = new Date(
            transactionYear,
            transactionMonth,
            transactionDay
          );
          return transactionDate >= start && transactionDate <= end;
        })
      );
  }

  /**
   * Get transfers for a specific period
   */
  private async getTransfersForPeriod(
    userId: string,
    start: Date,
    end: Date
  ): Promise<Transfer[]> {
    const repository = this._database.repositoryFor(Transfer);

    return repository
      .find({
        where: {
          user: { id: userId },
        },
        relations: {
          fromAccount: true,
          toAccount: true,
          category: true,
        },
      })
      .then((transfers) =>
        transfers.filter((t) => {
          // Parse date parts to avoid timezone issues with 'YYYY-MM-DD' format
          const dateParts = t.date.split('-');
          const transferYear = parseInt(dateParts[0]);
          const transferMonth = parseInt(dateParts[1]) - 1; // Convert to 0-indexed
          const transferDay = parseInt(dateParts[2]);

          const transferDate = new Date(
            transferYear,
            transferMonth,
            transferDay
          );
          return transferDate >= start && transferDate <= end;
        })
      );
  }

  /**
   * Calculate daily breakdown for a month
   */
  private calculateDailyBreakdown(
    transactions: Transaction[],
    transfers: Transfer[],
    monthStart: Date,
    monthEnd: Date
  ) {
    const daysInMonth = monthEnd.getDate();
    const dailyBreakdown = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayTransactions = transactions.filter((t: Transaction) => {
        const dateParts = t.date.split('-');
        const transactionDay = parseInt(dateParts[2]);
        return transactionDay === day;
      });
      const dayTransfers = transfers.filter((t: Transfer) => {
        const dateParts = t.date.split('-');
        const transferDay = parseInt(dateParts[2]);
        return transferDay === day;
      });

      const income = dayTransactions
        .filter((t: Transaction) => t.type === 'INCOME')
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

      const expenses = dayTransactions
        .filter((t: Transaction) => t.type === 'EXPENSE')
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

      const transferAmount = dayTransfers.reduce(
        (sum: number, t: Transfer) => sum + t.amount,
        0
      );

      dailyBreakdown.push({
        day,
        income,
        expenses,
        transfers: transferAmount,
      });
    }

    return dailyBreakdown;
  }

  /**
   * Calculate weekly breakdown for a month
   */
  private calculateWeeklyBreakdown(
    transactions: Transaction[],
    transfers: Transfer[],
    monthStart: Date,
    monthEnd: Date
  ) {
    const weeklyBreakdown = [];
    const daysInMonth = monthEnd.getDate();

    for (let week = 1; week <= 5; week++) {
      // Max 5 weeks in a month
      const weekStart = (week - 1) * 7 + 1;
      const weekEnd = Math.min(week * 7, daysInMonth);

      const weekTransactions = transactions.filter((t: Transaction) => {
        const dateParts = t.date.split('-');
        const day = parseInt(dateParts[2]);
        return day >= weekStart && day <= weekEnd;
      });

      const weekTransfers = transfers.filter((t: Transfer) => {
        const dateParts = t.date.split('-');
        const day = parseInt(dateParts[2]);
        return day >= weekStart && day <= weekEnd;
      });

      if (weekTransactions.length === 0 && weekTransfers.length === 0) continue;

      const income = weekTransactions
        .filter((t: Transaction) => t.type === 'INCOME')
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

      const expenses = weekTransactions
        .filter((t: Transaction) => t.type === 'EXPENSE')
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

      const transferAmount = weekTransfers.reduce(
        (sum: number, t: Transfer) => sum + t.amount,
        0
      );

      weeklyBreakdown.push({
        week,
        income,
        expenses,
        transfers: transferAmount,
      });
    }

    return weeklyBreakdown;
  }

  /**
   * Calculate monthly category breakdown
   */
  private calculateMonthlyCategoryBreakdown(transactions: Transaction[]) {
    const expenseTransactions = transactions.filter(
      (t: Transaction) => t.type === 'EXPENSE'
    );
    const totalExpenses = expenseTransactions.reduce(
      (sum: number, t: Transaction) => sum + t.amount,
      0
    );

    const categoryMap = new Map<string, { amount: number; count: number }>();

    expenseTransactions.forEach((t: Transaction) => {
      const category = t.category?.name || 'Uncategorized';
      const existing = categoryMap.get(category) || { amount: 0, count: 0 };
      existing.amount += t.amount;
      existing.count++;
      categoryMap.set(category, existing);
    });

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        transactionCount: data.count,
        percentOfTotal:
          totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Calculate monthly account activity
   */
  private async calculateMonthlyAccountActivity(
    userId: string,
    transactions: Transaction[],
    transfers: Transfer[]
  ) {
    const accounts = await this._accountsService.all(userId);
    const activityMap = new Map();

    // Initialize with accounts
    accounts.forEach((account) => {
      activityMap.set(account.id, {
        accountId: account.id,
        accountName: account.name,
        income: 0,
        expenses: 0,
        transfersIn: 0,
        transfersOut: 0,
        netChange: 0,
      });
    });

    // Add transaction data
    transactions.forEach((t: Transaction) => {
      const activity = activityMap.get(t.account.id);
      if (activity) {
        if (t.type === 'INCOME') {
          activity.income += t.amount;
        } else {
          activity.expenses += t.amount;
        }
      }
    });

    // Add transfer data
    transfers.forEach((t: Transfer) => {
      const fromActivity = activityMap.get(t.fromAccount.id);
      const toActivity = activityMap.get(t.toAccount.id);

      if (fromActivity) {
        fromActivity.transfersOut += t.amount;
      }
      if (toActivity) {
        toActivity.transfersIn += t.amount;
      }
    });

    // Calculate net changes
    Array.from(activityMap.values()).forEach((activity: any) => {
      activity.netChange =
        activity.income -
        activity.expenses +
        activity.transfersIn -
        activity.transfersOut;
    });

    return Array.from(activityMap.values());
  }

  /**
   * Calculate comparison with previous month
   */
  private async calculateMonthlyComparison(
    userId: string,
    currentMonth: number,
    currentYear: number,
    previousMonth: number,
    previousYear: number
  ) {
    const [currentData, previousData] = await Promise.all([
      this.getMonthlyBasicData(userId, currentMonth, currentYear),
      this.getMonthlyBasicData(userId, previousMonth, previousYear),
    ]);

    return {
      incomeChange: currentData.income - previousData.income,
      expenseChange: currentData.expenses - previousData.expenses,
      netCashFlowChange:
        currentData.income -
        currentData.expenses -
        (previousData.income - previousData.expenses),
      transactionCountChange:
        currentData.transactionCount - previousData.transactionCount,
    };
  }

  /**
   * Get basic monthly data for comparison
   */
  private async getMonthlyBasicData(
    userId: string,
    month: number,
    year: number
  ) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const transactions = await this.getTransactionsForPeriod(
      userId,
      monthStart,
      monthEnd
    );

    const income = transactions
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      income,
      expenses,
      transactionCount: transactions.length,
    };
  }
}
