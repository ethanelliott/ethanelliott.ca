import { Injectable, inject, signal, computed } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, forkJoin, BehaviorSubject, catchError, of } from 'rxjs';
import { FinanceApiService, Transaction } from './finance-api.service';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  isWithinInterval,
  subMonths,
  startOfYear,
  endOfYear,
} from 'date-fns';

@Injectable({
  providedIn: 'root',
})
export class TransactionsService {
  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);

  // Loading states
  private readonly _loading = signal(false);
  private readonly _initialLoadComplete = signal(false);

  // Data signals
  private readonly _transactions = signal<Transaction[]>([]);
  private readonly _categories = signal<string[]>([]);
  private readonly _mediums = signal<string[]>([]);
  private readonly _tags = signal<string[]>([]);

  // Public readonly signals
  readonly loading = this._loading.asReadonly();
  readonly initialLoadComplete = this._initialLoadComplete.asReadonly();
  readonly transactions = this._transactions.asReadonly();
  readonly categories = this._categories.asReadonly();
  readonly mediums = this._mediums.asReadonly();
  readonly tags = this._tags.asReadonly();

  // Computed values
  readonly transactionCount = computed(() => this.transactions().length);
  readonly totalIncome = computed(() =>
    this.transactions()
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0)
  );
  readonly totalExpenses = computed(() =>
    this.transactions()
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0)
  );
  readonly netAmount = computed(
    () => this.totalIncome() - this.totalExpenses()
  );

  // Monthly analytics computed values
  readonly currentMonthTransactions = computed(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    return this.transactions().filter((t) =>
      isWithinInterval(new Date(t.date), { start: monthStart, end: monthEnd })
    );
  });

  readonly currentMonthIncome = computed(() =>
    this.currentMonthTransactions()
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  readonly currentMonthExpenses = computed(() =>
    this.currentMonthTransactions()
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  readonly currentMonthNet = computed(
    () => this.currentMonthIncome() - this.currentMonthExpenses()
  );

  // Previous month for comparison
  readonly previousMonthTransactions = computed(() => {
    const lastMonth = subMonths(new Date(), 1);
    const monthStart = startOfMonth(lastMonth);
    const monthEnd = endOfMonth(lastMonth);

    return this.transactions().filter((t) =>
      isWithinInterval(new Date(t.date), { start: monthStart, end: monthEnd })
    );
  });

  readonly previousMonthExpenses = computed(() =>
    this.previousMonthTransactions()
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  // Monthly trend data (last 12 months)
  readonly monthlyTrends = computed(() => {
    const now = new Date();
    const startDate = subMonths(now, 11); // Last 12 months
    const months = eachMonthOfInterval({ start: startDate, end: now });

    return months.map((month) => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const monthTransactions = this.transactions().filter((t) =>
        isWithinInterval(new Date(t.date), { start: monthStart, end: monthEnd })
      );

      const income = monthTransactions
        .filter((t) => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.amount, 0);

      const expenses = monthTransactions
        .filter((t) => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);

      return {
        month: format(month, 'MMM yyyy'),
        date: month,
        income,
        expenses,
        net: income - expenses,
        transactionCount: monthTransactions.length,
      };
    });
  });

  // Category breakdown for current month
  readonly currentMonthCategoryBreakdown = computed(() => {
    const transactions = this.currentMonthTransactions().filter(
      (t) => t.type === 'EXPENSE'
    );
    const categoryMap = new Map<string, number>();

    transactions.forEach((t) => {
      categoryMap.set(
        t.category,
        (categoryMap.get(t.category) || 0) + t.amount
      );
    });

    return Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  });

  // Medium breakdown
  readonly mediumBreakdown = computed(() => {
    const transactions = this.transactions();
    const mediumMap = new Map<
      string,
      { income: number; expenses: number; count: number }
    >();

    transactions.forEach((t) => {
      const current = mediumMap.get(t.medium) || {
        income: 0,
        expenses: 0,
        count: 0,
      };
      if (t.type === 'INCOME') {
        current.income += t.amount;
      } else {
        current.expenses += t.amount;
      }
      current.count++;
      mediumMap.set(t.medium, current);
    });

    return Array.from(mediumMap.entries())
      .map(([medium, data]) => ({ medium, ...data }))
      .sort((a, b) => b.income + b.expenses - (a.income + a.expenses));
  });

  // Financial health score (0-100)
  readonly financialHealthScore = computed(() => {
    const monthlyData = this.monthlyTrends();
    if (monthlyData.length < 3) return 50; // Default score for insufficient data

    const recent3Months = monthlyData.slice(-3);
    const avgNet = recent3Months.reduce((sum, m) => sum + m.net, 0) / 3;
    const avgExpenses =
      recent3Months.reduce((sum, m) => sum + m.expenses, 0) / 3;

    // Score factors
    let score = 50; // Base score

    // Net worth trend (+/- 30 points)
    if (avgNet > 0) score += Math.min(30, (avgNet / 1000) * 5);
    else score -= Math.min(30, (Math.abs(avgNet) / 1000) * 5);

    // Spending consistency (+/- 20 points)
    const expenseVariance =
      recent3Months.reduce(
        (sum, m) => sum + Math.pow(m.expenses - avgExpenses, 2),
        0
      ) / 3;
    const consistency = Math.max(0, 20 - expenseVariance / 10000);
    score += consistency;

    return Math.max(0, Math.min(100, Math.round(score)));
  });

  // Top spending patterns
  readonly topMerchants = computed(() => {
    const merchantMap = new Map<string, { amount: number; count: number }>();

    this.transactions()
      .filter((t) => t.type === 'EXPENSE')
      .forEach((t) => {
        const current = merchantMap.get(t.description) || {
          amount: 0,
          count: 0,
        };
        current.amount += t.amount;
        current.count++;
        merchantMap.set(t.description, current);
      });

    return Array.from(merchantMap.entries())
      .map(([description, data]) => ({ description, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  });

  constructor() {
    // Load initial data
    this.loadAllData();
  }

  /**
   * Load all data (transactions, categories, mediums, tags)
   */
  loadAllData(): Observable<boolean> {
    this._loading.set(true);

    const requests = forkJoin({
      transactions: this.apiService.getAllTransactions().pipe(
        catchError((error) => {
          console.error('Error loading transactions:', error);
          this.showError('Error loading transactions');
          return of([]);
        })
      ),
      categories: this.apiService.getAllCategories().pipe(
        catchError((error) => {
          console.error('Error loading categories:', error);
          this.showError('Error loading categories');
          return of([]);
        })
      ),
      mediums: this.apiService.getAllMediums().pipe(
        catchError((error) => {
          console.error('Error loading mediums:', error);
          this.showError('Error loading mediums');
          return of([]);
        })
      ),
      tags: this.apiService.getAllTags().pipe(
        catchError((error) => {
          console.error('Error loading tags:', error);
          this.showError('Error loading tags');
          return of([]);
        })
      ),
    });

    const result = new BehaviorSubject<boolean>(false);

    requests.subscribe({
      next: (data) => {
        this._transactions.set(data.transactions);
        this._categories.set(data.categories);
        this._mediums.set(data.mediums);
        this._tags.set(data.tags);
        this._loading.set(false);
        this._initialLoadComplete.set(true);
        result.next(true);
      },
      error: (error) => {
        console.error('Error loading data:', error);
        this._loading.set(false);
        this.showError('Error loading data');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Refresh transactions data
   */
  refreshTransactions(): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.getAllTransactions().subscribe({
      next: (transactions) => {
        this._transactions.set(transactions);
        result.next(true);
      },
      error: (error) => {
        console.error('Error refreshing transactions:', error);
        this.showError('Error refreshing transactions');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Create a new transaction
   */
  createTransaction(
    transaction: Omit<Transaction, 'id' | 'timestamp' | 'updatedAt'>
  ): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.createTransaction(transaction).subscribe({
      next: (newTransaction) => {
        // Add the new transaction to the current list
        this._transactions.update((current) => [...current, newTransaction]);
        this.showSuccess('Transaction created successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error creating transaction:', error);
        this.showError('Error creating transaction');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Update an existing transaction
   */
  updateTransaction(
    id: string,
    transaction: Omit<Transaction, 'id' | 'timestamp' | 'updatedAt'>
  ): Observable<boolean> {
    if (!id) {
      console.error('Cannot update transaction without id');
      this.showError('Error: Transaction ID missing');
      return of(false);
    }

    const result = new BehaviorSubject<boolean>(false);

    this.apiService.updateTransaction(id, transaction).subscribe({
      next: (updatedTransaction) => {
        // Update the transaction in the current list
        this._transactions.update((current) =>
          current.map((t) => (t.id === id ? updatedTransaction : t))
        );
        this.showSuccess('Transaction updated successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error updating transaction:', error);
        this.showError('Error updating transaction');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Delete a transaction
   */
  deleteTransaction(id: string): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.deleteTransaction(id).subscribe({
      next: () => {
        // Remove the transaction from the current list
        this._transactions.update((current) =>
          current.filter((t) => t.id !== id)
        );
        this.showSuccess('Transaction deleted successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error deleting transaction:', error);
        this.showError('Error deleting transaction');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Create a new category
   */
  createCategory(name: string): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.createCategory({ name }).subscribe({
      next: () => {
        // Add the new category to the current list
        this._categories.update((current) => [...current, name]);
        this.showSuccess('Category created successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error creating category:', error);
        this.showError('Error creating category');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Delete a category
   */
  deleteCategory(name: string): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.deleteCategory(name).subscribe({
      next: () => {
        // Remove the category from the current list
        this._categories.update((current) => current.filter((c) => c !== name));
        this.showSuccess('Category deleted successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error deleting category:', error);
        this.showError('Error deleting category');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Create a new medium
   */
  createMedium(name: string): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.createMedium({ name }).subscribe({
      next: () => {
        // Add the new medium to the current list
        this._mediums.update((current) => [...current, name]);
        this.showSuccess('Payment method created successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error creating medium:', error);
        this.showError('Error creating payment method');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Delete a medium
   */
  deleteMedium(name: string): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.deleteMedium(name).subscribe({
      next: () => {
        // Remove the medium from the current list
        this._mediums.update((current) => current.filter((m) => m !== name));
        this.showSuccess('Payment method deleted successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error deleting medium:', error);
        this.showError('Error deleting payment method');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Create a new tag
   */
  createTag(name: string): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.createTag({ name }).subscribe({
      next: () => {
        // Add the new tag to the current list
        this._tags.update((current) => [...current, name]);
        this.showSuccess('Tag created successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error creating tag:', error);
        this.showError('Error creating tag');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Delete a tag
   */
  deleteTag(name: string): Observable<boolean> {
    const result = new BehaviorSubject<boolean>(false);

    this.apiService.deleteTag(name).subscribe({
      next: () => {
        // Remove the tag from the current list
        this._tags.update((current) => current.filter((t) => t !== name));
        this.showSuccess('Tag deleted successfully');
        result.next(true);
      },
      error: (error) => {
        console.error('Error deleting tag:', error);
        this.showError('Error deleting tag');
        result.next(false);
      },
    });

    return result.asObservable();
  }

  /**
   * Get a single transaction by ID
   */
  getTransaction(id: string): Transaction | undefined {
    return this.transactions().find((t) => t.id === id);
  }

  /**
   * Filter transactions by criteria
   */
  filterTransactions(criteria: {
    type?: 'INCOME' | 'EXPENSE';
    category?: string;
    medium?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
  }): Transaction[] {
    return this.transactions().filter((transaction) => {
      if (criteria.type && transaction.type !== criteria.type) {
        return false;
      }
      if (criteria.category && transaction.category !== criteria.category) {
        return false;
      }
      if (criteria.medium && transaction.medium !== criteria.medium) {
        return false;
      }
      if (criteria.tags && criteria.tags.length > 0) {
        const hasAllTags = criteria.tags.every((tag) =>
          transaction.tags.includes(tag)
        );
        if (!hasAllTags) {
          return false;
        }
      }
      if (criteria.dateFrom && transaction.date < criteria.dateFrom) {
        return false;
      }
      if (criteria.dateTo && transaction.date > criteria.dateTo) {
        return false;
      }
      return true;
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar'],
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: ['error-snackbar'],
    });
  }
}
