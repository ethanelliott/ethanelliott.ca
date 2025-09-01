import { computed, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  EMPTY,
  catchError,
  forkJoin,
  map,
  of,
  pipe,
  switchMap,
  tap,
} from 'rxjs';
import {
  FinanceApiService,
  Transaction,
  TransactionInput,
  AllTimeOverview,
  MonthlyHabitsOverview,
  NetWorthData,
  FinancialHealthScore,
} from '../services/finance-api.service';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  isWithinInterval,
  subMonths,
} from 'date-fns';

// State interface
interface FinanceState {
  // Loading states
  loading: boolean;
  initialLoadComplete: boolean;
  submitting: boolean;

  // Data
  transactions: Transaction[];
  categories: string[];
  tags: string[];

  // Overview data
  allTimeOverview: AllTimeOverview | null;
  currentMonthOverview: MonthlyHabitsOverview | null;
  netWorthData: NetWorthData | null;
  financialHealthScore: FinancialHealthScore | null;

  // Filter/Search state
  searchTerm: string;
  selectedCategory: string | null;
  selectedTags: string[];
  dateFrom: string | null;
  dateTo: string | null;
  transactionType: 'ALL' | 'INCOME' | 'EXPENSE';

  // UI state
  showAddForm: boolean;
  editingTransaction: Transaction | null;

  // Error state
  error: string | null;
}

// Initial state
const initialState: FinanceState = {
  loading: false,
  initialLoadComplete: false,
  submitting: false,
  transactions: [],
  categories: [],
  tags: [],
  allTimeOverview: null,
  currentMonthOverview: null,
  netWorthData: null,
  financialHealthScore: null,
  searchTerm: '',
  selectedCategory: null,
  selectedTags: [],
  dateFrom: null,
  dateTo: null,
  transactionType: 'ALL',
  showAddForm: false,
  editingTransaction: null,
  error: null,
};

// Monthly trend interface
interface MonthlyTrend {
  month: string;
  date: Date;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

// Category breakdown interface
interface CategoryBreakdown {
  category: string;
  amount: number;
}

// Store definition
export const FinanceStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((state) => {
    const apiService = inject(FinanceApiService);
    const snackBar = inject(MatSnackBar);

    return {
      // Basic computed values
      transactionCount: computed(() => state.transactions().length),

      // Enhanced computed values using overview data when available
      totalIncome: computed(
        () =>
          state.allTimeOverview()?.totalIncome ??
          state
            .transactions()
            .filter((t) => t.type === 'INCOME')
            .reduce((sum, t) => sum + t.amount, 0)
      ),

      totalExpenses: computed(
        () =>
          state.allTimeOverview()?.totalExpenses ??
          state
            .transactions()
            .filter((t) => t.type === 'EXPENSE')
            .reduce((sum, t) => sum + t.amount, 0)
      ),

      netAmount: computed(
        () =>
          state.allTimeOverview()?.netCashFlow ??
          (() => {
            const income = state
              .transactions()
              .filter((t) => t.type === 'INCOME')
              .reduce((sum, t) => sum + t.amount, 0);
            const expenses = state
              .transactions()
              .filter((t) => t.type === 'EXPENSE')
              .reduce((sum, t) => sum + t.amount, 0);
            return income - expenses;
          })()
      ),

      // New computed values from comprehensive overview
      currentNetWorth: computed(
        () => state.allTimeOverview()?.currentNetWorth ?? 0
      ),

      totalAccountBalance: computed(
        () => state.allTimeOverview()?.totalAccountBalance ?? 0
      ),

      savingsRate: computed(() => state.allTimeOverview()?.savingsRate ?? 0),

      expenseToIncomeRatio: computed(
        () => state.allTimeOverview()?.expenseToIncomeRatio ?? 0
      ),

      accountBalances: computed(
        () => state.allTimeOverview()?.accountBalances ?? []
      ),

      topExpenseCategories: computed(
        () => state.allTimeOverview()?.topExpenseCategories ?? []
      ),

      healthScore: computed(
        () => state.financialHealthScore()?.healthScore ?? 50
      ),

      financialRecommendations: computed(
        () => state.financialHealthScore()?.recommendations ?? []
      ),

      // Monthly overview data
      currentMonthData: computed(() => state.currentMonthOverview()),

      monthlyDailyBreakdown: computed(
        () => state.currentMonthOverview()?.dailyBreakdown ?? []
      ),

      monthlyWeeklyBreakdown: computed(
        () => state.currentMonthOverview()?.weeklyBreakdown ?? []
      ),

      monthlyCategoryBreakdown: computed(
        () => state.currentMonthOverview()?.categoryBreakdown ?? []
      ),

      monthlyAccountActivity: computed(
        () => state.currentMonthOverview()?.accountActivity ?? []
      ),

      // Filtered transactions based on current filters
      filteredTransactions: computed(() => {
        let filtered = state.transactions();

        // Filter by transaction type
        if (state.transactionType() !== 'ALL') {
          filtered = filtered.filter((t) => t.type === state.transactionType());
        }

        // Filter by category
        if (state.selectedCategory()) {
          filtered = filtered.filter(
            (t) => t.category === state.selectedCategory()
          );
        }

        // Filter by tags
        if (state.selectedTags().length > 0) {
          filtered = filtered.filter((t) =>
            state.selectedTags().every((tag) => t.tags.includes(tag))
          );
        }

        // Filter by date range
        if (state.dateFrom()) {
          filtered = filtered.filter((t) => t.date >= state.dateFrom()!);
        }
        if (state.dateTo()) {
          filtered = filtered.filter((t) => t.date <= state.dateTo()!);
        }

        // Filter by search term
        if (state.searchTerm()) {
          const searchLower = state.searchTerm().toLowerCase();
          filtered = filtered.filter(
            (t) =>
              t.description.toLowerCase().includes(searchLower) ||
              t.category.toLowerCase().includes(searchLower) ||
              t.tags.some((tag) => tag.toLowerCase().includes(searchLower))
          );
        }

        return filtered;
      }),

      // Current month transactions
      currentMonthTransactions: computed(() => {
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);

        return state.transactions().filter((t) =>
          isWithinInterval(new Date(t.date), {
            start: monthStart,
            end: monthEnd,
          })
        );
      }),

      // Current month income/expenses
      currentMonthIncome: computed(() =>
        state
          .transactions()
          .filter((t) => {
            const now = new Date();
            const monthStart = startOfMonth(now);
            const monthEnd = endOfMonth(now);
            return (
              t.type === 'INCOME' &&
              isWithinInterval(new Date(t.date), {
                start: monthStart,
                end: monthEnd,
              })
            );
          })
          .reduce((sum, t) => sum + t.amount, 0)
      ),

      currentMonthExpenses: computed(() =>
        state
          .transactions()
          .filter((t) => {
            const now = new Date();
            const monthStart = startOfMonth(now);
            const monthEnd = endOfMonth(now);
            return (
              t.type === 'EXPENSE' &&
              isWithinInterval(new Date(t.date), {
                start: monthStart,
                end: monthEnd,
              })
            );
          })
          .reduce((sum, t) => sum + t.amount, 0)
      ),

      currentMonthNet: computed(() => {
        const income = state
          .transactions()
          .filter((t) => {
            const now = new Date();
            const monthStart = startOfMonth(now);
            const monthEnd = endOfMonth(now);
            return (
              t.type === 'INCOME' &&
              isWithinInterval(new Date(t.date), {
                start: monthStart,
                end: monthEnd,
              })
            );
          })
          .reduce((sum, t) => sum + t.amount, 0);

        const expenses = state
          .transactions()
          .filter((t) => {
            const now = new Date();
            const monthStart = startOfMonth(now);
            const monthEnd = endOfMonth(now);
            return (
              t.type === 'EXPENSE' &&
              isWithinInterval(new Date(t.date), {
                start: monthStart,
                end: monthEnd,
              })
            );
          })
          .reduce((sum, t) => sum + t.amount, 0);

        return income - expenses;
      }),

      // Previous month for comparison
      previousMonthTransactions: computed(() => {
        const lastMonth = subMonths(new Date(), 1);
        const monthStart = startOfMonth(lastMonth);
        const monthEnd = endOfMonth(lastMonth);

        return state.transactions().filter((t) =>
          isWithinInterval(new Date(t.date), {
            start: monthStart,
            end: monthEnd,
          })
        );
      }),

      previousMonthExpenses: computed(() =>
        state
          .transactions()
          .filter((t) => {
            const lastMonth = subMonths(new Date(), 1);
            const monthStart = startOfMonth(lastMonth);
            const monthEnd = endOfMonth(lastMonth);
            return (
              t.type === 'EXPENSE' &&
              isWithinInterval(new Date(t.date), {
                start: monthStart,
                end: monthEnd,
              })
            );
          })
          .reduce((sum, t) => sum + t.amount, 0)
      ),

      // Monthly trends (from overview data or fallback)
      monthlyTrends: computed(() => {
        const overviewData = state.allTimeOverview()?.monthlyBreakdowns;
        if (overviewData) {
          return overviewData.map((breakdown) => ({
            month: breakdown.month,
            date: new Date(breakdown.year, 0, 1), // Approximate date
            income: breakdown.totalIncome,
            expenses: breakdown.totalExpenses,
            net: breakdown.netCashFlow,
            transactionCount: breakdown.transactionCount,
          }));
        }

        // Fallback to original calculation
        const now = new Date();
        const startDate = subMonths(now, 11);
        const months = eachMonthOfInterval({ start: startDate, end: now });

        return months.map((month) => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          const monthTransactions = state.transactions().filter((t) =>
            isWithinInterval(new Date(t.date), {
              start: monthStart,
              end: monthEnd,
            })
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
      }),

      // Category breakdown for current month
      currentMonthCategoryBreakdown: computed((): CategoryBreakdown[] => {
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);

        const transactions = state.transactions().filter(
          (t) =>
            t.type === 'EXPENSE' &&
            isWithinInterval(new Date(t.date), {
              start: monthStart,
              end: monthEnd,
            })
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
      }),

      // Financial health score (0-100)
      financialHealthScore: computed(() => {
        const monthlyData = state.transactions();
        const trends = eachMonthOfInterval({
          start: subMonths(new Date(), 11),
          end: new Date(),
        }).map((month) => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          const monthTransactions = monthlyData.filter((t) =>
            isWithinInterval(new Date(t.date), {
              start: monthStart,
              end: monthEnd,
            })
          );

          const income = monthTransactions
            .filter((t) => t.type === 'INCOME')
            .reduce((sum, t) => sum + t.amount, 0);
          const expenses = monthTransactions
            .filter((t) => t.type === 'EXPENSE')
            .reduce((sum, t) => sum + t.amount, 0);

          return { income, expenses, net: income - expenses };
        });

        if (trends.length < 3) return 50;

        const recent3Months = trends.slice(-3);
        const avgNet = recent3Months.reduce((sum, m) => sum + m.net, 0) / 3;
        const avgExpenses =
          recent3Months.reduce((sum, m) => sum + m.expenses, 0) / 3;

        let score = 50;

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
      }),

      // Top merchants/descriptions
      topMerchants: computed(() => {
        const merchantMap = new Map<
          string,
          { amount: number; count: number }
        >();

        state
          .transactions()
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
      }),

      // Recent transactions (last 10)
      recentTransactions: computed(() =>
        state
          .transactions()
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          )
          .slice(0, 10)
      ),
    };
  }),
  withMethods((store) => {
    const apiService = inject(FinanceApiService);
    const snackBar = inject(MatSnackBar);

    const showSuccess = (message: string) => {
      snackBar.open(message, 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar'],
      });
    };

    const showError = (message: string) => {
      patchState(store, { error: message });
      snackBar.open(message, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar'],
      });
    };

    const clearError = () => {
      patchState(store, { error: null });
    };

    return {
      // UI state methods
      setSearchTerm: (searchTerm: string) => {
        patchState(store, { searchTerm });
      },

      setSelectedCategory: (category: string | null) => {
        patchState(store, { selectedCategory: category });
      },

      setSelectedTags: (tags: string[]) => {
        patchState(store, { selectedTags: tags });
      },

      setDateRange: (dateFrom: string | null, dateTo: string | null) => {
        patchState(store, { dateFrom, dateTo });
      },

      setTransactionType: (type: 'ALL' | 'INCOME' | 'EXPENSE') => {
        patchState(store, { transactionType: type });
      },

      clearFilters: () => {
        patchState(store, {
          searchTerm: '',
          selectedCategory: null,
          selectedTags: [],
          dateFrom: null,
          dateTo: null,
          transactionType: 'ALL',
        });
      },

      setShowAddForm: (show: boolean) => {
        patchState(store, { showAddForm: show });
        if (!show) {
          patchState(store, { editingTransaction: null });
        }
      },

      setEditingTransaction: (transaction: Transaction | null) => {
        patchState(store, { editingTransaction: transaction });
        if (transaction) {
          patchState(store, { showAddForm: true });
        }
      },

      clearError,

      // Data loading methods
      loadAllData: rxMethod<void>(
        pipe(
          tap(() => {
            patchState(store, { loading: true, error: null });
          }),
          switchMap(() =>
            forkJoin({
              transactions: apiService.getAllTransactions().pipe(
                catchError((error) => {
                  console.error('Error loading transactions:', error);
                  showError('Error loading transactions');
                  return of([]);
                })
              ),
              categories: apiService.getAllCategories().pipe(
                catchError((error) => {
                  console.error('Error loading categories:', error);
                  showError('Error loading categories');
                  return of([]);
                })
              ),
              tags: apiService.getAllTags().pipe(
                catchError((error) => {
                  console.error('Error loading tags:', error);
                  showError('Error loading tags');
                  return of([]);
                })
              ),
              allTimeOverview: apiService.getAllTimeOverview().pipe(
                catchError((error) => {
                  console.error('Error loading all-time overview:', error);
                  // Don't show error for overview - it's supplementary data
                  return of(null);
                })
              ),
              currentMonthOverview: apiService.getCurrentMonthOverview().pipe(
                catchError((error) => {
                  console.error('Error loading current month overview:', error);
                  // Don't show error for overview - it's supplementary data
                  return of(null);
                })
              ),
              netWorthData: apiService.getNetWorth().pipe(
                catchError((error) => {
                  console.error('Error loading net worth:', error);
                  return of(null);
                })
              ),
              financialHealthScore: apiService.getFinancialHealthScore().pipe(
                catchError((error) => {
                  console.error('Error loading financial health score:', error);
                  return of(null);
                })
              ),
            })
          ),
          tap((data) => {
            patchState(store, {
              transactions: data.transactions,
              categories: data.categories,
              tags: data.tags,
              allTimeOverview: data.allTimeOverview,
              currentMonthOverview: data.currentMonthOverview,
              netWorthData: data.netWorthData,
              financialHealthScore: data.financialHealthScore,
              loading: false,
              initialLoadComplete: true,
              error: null,
            });
          }),
          catchError((error) => {
            console.error('Error loading data:', error);
            patchState(store, {
              loading: false,
              error: 'Failed to load data',
            });
            return EMPTY;
          })
        )
      ),

      // Load overview data independently
      loadOverviewData: rxMethod<void>(
        pipe(
          switchMap(() =>
            forkJoin({
              allTimeOverview: apiService.getAllTimeOverview(),
              currentMonthOverview: apiService.getCurrentMonthOverview(),
              netWorthData: apiService.getNetWorth(),
              financialHealthScore: apiService.getFinancialHealthScore(),
            }).pipe(
              tap((data) => {
                patchState(store, {
                  allTimeOverview: data.allTimeOverview,
                  currentMonthOverview: data.currentMonthOverview,
                  netWorthData: data.netWorthData,
                  financialHealthScore: data.financialHealthScore,
                });
              }),
              catchError((error) => {
                console.error('Error loading overview data:', error);
                showError('Error loading overview data');
                return EMPTY;
              })
            )
          )
        )
      ),

      // Load specific month overview
      loadMonthlyHabitsOverview: rxMethod<{ year: number; month: number }>(
        pipe(
          switchMap(({ year, month }) =>
            apiService.getMonthlyHabitsOverview(year, month).pipe(
              tap((overview) => {
                // If it's the current month, update the current month overview
                const now = new Date();
                if (year === now.getFullYear() && month === now.getMonth()) {
                  patchState(store, { currentMonthOverview: overview });
                }
                // For other months, you might want to store it differently
                // or emit it as a separate signal
              }),
              catchError((error) => {
                console.error('Error loading monthly habits overview:', error);
                showError('Error loading monthly habits overview');
                return EMPTY;
              })
            )
          )
        )
      ),

      refreshTransactions: rxMethod<void>(
        pipe(
          switchMap(() =>
            apiService.getAllTransactions().pipe(
              tap((transactions) => {
                patchState(store, { transactions });
              }),
              catchError((error) => {
                console.error('Error refreshing transactions:', error);
                showError('Error refreshing transactions');
                return EMPTY;
              })
            )
          )
        )
      ),

      // Transaction CRUD operations
      createTransaction: rxMethod<
        Omit<Transaction, 'id' | 'timestamp' | 'updatedAt'>
      >(
        pipe(
          tap(() => patchState(store, { submitting: true, error: null })),
          switchMap((transaction) => {
            // Transform to TransactionInput format
            const transactionInput: TransactionInput = {
              type: transaction.type,
              account: transaction.account.id, // Convert account object to ID string
              date: transaction.date,
              amount: transaction.amount,
              category: transaction.category,
              tags: transaction.tags,
              description: transaction.description,
            };
            return apiService.createTransaction(transactionInput).pipe(
              tap((newTransaction) => {
                patchState(store, {
                  transactions: [...store.transactions(), newTransaction],
                  submitting: false,
                  showAddForm: false,
                  editingTransaction: null,
                });
                showSuccess('Transaction created successfully');
              }),
              catchError((error) => {
                console.error('Error creating transaction:', error);
                patchState(store, { submitting: false });
                showError('Error creating transaction');
                return EMPTY;
              })
            );
          })
        )
      ),

      updateTransaction: rxMethod<{
        id: string;
        transaction: Omit<Transaction, 'id' | 'timestamp' | 'updatedAt'>;
      }>(
        pipe(
          tap(() => patchState(store, { submitting: true, error: null })),
          switchMap(({ id, transaction }) => {
            // Transform to TransactionInput format
            const transactionInput: TransactionInput = {
              type: transaction.type,
              account: transaction.account.id, // Convert account object to ID string
              date: transaction.date,
              amount: transaction.amount,
              category: transaction.category,
              tags: transaction.tags,
              description: transaction.description,
            };
            return apiService.updateTransaction(id, transactionInput).pipe(
              tap((updatedTransaction) => {
                patchState(store, {
                  transactions: store
                    .transactions()
                    .map((t) => (t.id === id ? updatedTransaction : t)),
                  submitting: false,
                  showAddForm: false,
                  editingTransaction: null,
                });
                showSuccess('Transaction updated successfully');
              }),
              catchError((error) => {
                console.error('Error updating transaction:', error);
                patchState(store, { submitting: false });
                showError('Error updating transaction');
                return EMPTY;
              })
            );
          })
        )
      ),

      deleteTransaction: rxMethod<string>(
        pipe(
          switchMap((id) =>
            apiService.deleteTransaction(id).pipe(
              tap(() => {
                patchState(store, {
                  transactions: store.transactions().filter((t) => t.id !== id),
                });
                showSuccess('Transaction deleted successfully');
              }),
              catchError((error) => {
                console.error('Error deleting transaction:', error);
                showError('Error deleting transaction');
                return EMPTY;
              })
            )
          )
        )
      ),

      // Category operations
      createCategory: rxMethod<string>(
        pipe(
          switchMap((name) =>
            apiService.createCategory({ name }).pipe(
              tap(() => {
                patchState(store, {
                  categories: [...store.categories(), name],
                });
                showSuccess('Category created successfully');
              }),
              catchError((error) => {
                console.error('Error creating category:', error);
                showError('Error creating category');
                return EMPTY;
              })
            )
          )
        )
      ),

      deleteCategory: rxMethod<string>(
        pipe(
          switchMap((name) =>
            apiService.deleteCategory(name).pipe(
              tap(() => {
                patchState(store, {
                  categories: store.categories().filter((c) => c !== name),
                });
                showSuccess('Category deleted successfully');
              }),
              catchError((error) => {
                console.error('Error deleting category:', error);
                showError('Error deleting category');
                return EMPTY;
              })
            )
          )
        )
      ),

      // Tag operations
      createTag: rxMethod<string>(
        pipe(
          switchMap((name) =>
            apiService.createTag({ name }).pipe(
              tap(() => {
                patchState(store, {
                  tags: [...store.tags(), name],
                });
                showSuccess('Tag created successfully');
              }),
              catchError((error) => {
                console.error('Error creating tag:', error);
                showError('Error creating tag');
                return EMPTY;
              })
            )
          )
        )
      ),

      deleteTag: rxMethod<string>(
        pipe(
          switchMap((name) =>
            apiService.deleteTag(name).pipe(
              tap(() => {
                patchState(store, {
                  tags: store.tags().filter((t) => t !== name),
                });
                showSuccess('Tag deleted successfully');
              }),
              catchError((error) => {
                console.error('Error deleting tag:', error);
                showError('Error deleting tag');
                return EMPTY;
              })
            )
          )
        )
      ),

      // Utility methods
      getTransaction: (id: string): Transaction | undefined => {
        return store.transactions().find((t) => t.id === id);
      },

      filterTransactions: (criteria: {
        type?: 'INCOME' | 'EXPENSE';
        category?: string;
        medium?: string;
        tags?: string[];
        dateFrom?: string;
        dateTo?: string;
      }): Transaction[] => {
        return store.transactions().filter((transaction) => {
          if (criteria.type && transaction.type !== criteria.type) {
            return false;
          }
          if (criteria.category && transaction.category !== criteria.category) {
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
      },
    };
  })
);

// Export types for use in components
export type FinanceStoreType = InstanceType<typeof FinanceStore>;
