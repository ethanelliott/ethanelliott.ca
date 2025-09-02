import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Account {
  id: string;
  name: string;
  description?: string;
  initialBalance: number;
  currentBalance?: number;
  totalIncome?: number;
  totalExpenses?: number;
  currency: string;
  timestamp: Date;
  updatedAt: Date;
}

export interface AccountInput {
  name: string;
  description?: string;
  initialBalance?: number;
  currency?: string;
}

export interface AccountSummary {
  totalAccounts: number;
  totalBalance: number;
}

export interface Transaction {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  account: {
    id: string;
    name: string;
  };
  date: string;
  amount: number;
  category: string;
  tags: string[];
  description: string;
  timestamp: Date;
  updatedAt: Date;
}

export interface TransactionInput {
  type: 'INCOME' | 'EXPENSE';
  account: string; // UUID
  date: string;
  amount: number;
  category: string; // Category name
  tags: string[]; // Tag names
  description: string;
}

export interface Transfer {
  id: string;
  transferType: string;
  date: string;
  amount: number;
  description: string;
  timestamp: Date;
  updatedAt: Date;
  fromAccount: {
    id: string;
    name: string;
  };
  toAccount: {
    id: string;
    name: string;
  };
  category?: string;
}

export interface TransferInput {
  transferType: string;
  fromAccountId: string;
  toAccountId: string;
  date: string;
  amount: number;
  description: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  timestamp: Date;
  updatedAt: Date;
}

export interface CategoryInput {
  name: string;
  description?: string;
  color?: string;
}

export interface Tag {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
  timestamp: Date;
  updatedAt: Date;
}

export interface TagInput {
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

// Overview interfaces
export interface AccountBalance {
  accountId: string;
  accountName: string;
  initialBalance: number;
  currentBalance: number;
  totalIncome: number;
  totalExpenses: number;
  transfersIn: number;
  transfersOut: number;
}

export interface CategoryInsight {
  category: string;
  totalSpent: number;
  transactionCount: number;
  averageTransaction: number;
  monthlyTrend: 'increasing' | 'decreasing' | 'stable';
  percentOfTotalExpenses: number;
}

export interface MonthlyBreakdown {
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

export interface AllTimeOverview {
  currentNetWorth: number;
  totalAccountBalance: number;
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  totalTransferVolume: number;
  accountCount: number;
  accountBalances: AccountBalance[];
  transactionCount: number;
  transferCount: number;
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
  daysSinceFirstTransaction: number;
  topExpenseCategories: CategoryInsight[];
  monthlyBreakdowns: MonthlyBreakdown[];
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  expenseToIncomeRatio: number;
  savingsRate: number;
}

export interface DailyBreakdown {
  day: number;
  income: number;
  expenses: number;
  transfers: number;
}

export interface WeeklyBreakdown {
  week: number;
  income: number;
  expenses: number;
  transfers: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  transactionCount: number;
  percentOfTotal: number;
}

export interface AccountActivity {
  accountId: string;
  accountName: string;
  income: number;
  expenses: number;
  transfersIn: number;
  transfersOut: number;
  netChange: number;
}

export interface MonthlyComparison {
  incomeChange: number;
  expenseChange: number;
  netCashFlowChange: number;
  transactionCountChange: number;
}

export interface MonthlyHabitsOverview {
  month: number;
  year: number;
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  totalTransferVolume: number;
  transfersIn: number;
  transfersOut: number;
  transactionCount: number;
  transferCount: number;
  averageTransactionSize: number;
  dailyBreakdown: DailyBreakdown[];
  weeklyBreakdown: WeeklyBreakdown[];
  categoryBreakdown: CategoryBreakdown[];
  accountActivity: AccountActivity[];
  comparison: MonthlyComparison;
}

export interface NetWorthData {
  currentNetWorth: number;
  totalAccountBalance: number;
  accountBalances: AccountBalance[];
  lastUpdated: string;
}

export interface FinancialHealthScore {
  healthScore: number;
  savingsRate: number;
  expenseToIncomeRatio: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  recommendations: string[];
}

export interface User {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  timestamp: Date;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class FinanceApiService {
  private readonly _http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080';

  // Accounts
  getAllAccounts(): Observable<Account[]> {
    return this._http.get<Account[]>(`${this.baseUrl}/finances/accounts`);
  }

  getAccount(id: string): Observable<Account> {
    return this._http.get<Account>(`${this.baseUrl}/finances/accounts/${id}`);
  }

  getAccountSummary(): Observable<AccountSummary> {
    return this._http.get<AccountSummary>(
      `${this.baseUrl}/finances/accounts/summary`
    );
  }

  createAccount(account: AccountInput): Observable<Account> {
    return this._http.post<Account>(
      `${this.baseUrl}/finances/accounts`,
      account
    );
  }

  updateAccount(id: string, account: AccountInput): Observable<Account> {
    return this._http.put<Account>(
      `${this.baseUrl}/finances/accounts/${id}`,
      account
    );
  }

  deleteAccount(id: string): Observable<{ success: boolean }> {
    return this._http.delete<{ success: boolean }>(
      `${this.baseUrl}/finances/accounts/${id}`
    );
  }

  deleteAllAccounts(): Observable<any> {
    return this._http.delete(`${this.baseUrl}/finances/accounts`);
  }

  // Transactions
  getAllTransactions(): Observable<Transaction[]> {
    return this._http.get<Transaction[]>(
      `${this.baseUrl}/finances/transactions`
    );
  }

  getTransaction(id: string): Observable<Transaction> {
    return this._http.get<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}`
    );
  }

  createTransaction(transaction: TransactionInput): Observable<Transaction> {
    return this._http.post<Transaction>(
      `${this.baseUrl}/finances/transactions`,
      transaction
    );
  }

  updateTransaction(
    id: string,
    transaction: TransactionInput
  ): Observable<Transaction> {
    return this._http.put<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}`,
      transaction
    );
  }

  deleteTransaction(id: string): Observable<{ success: boolean }> {
    return this._http.delete<{ success: boolean }>(
      `${this.baseUrl}/finances/transactions/${id}`
    );
  }

  deleteAllTransactions(): Observable<{
    success: boolean;
    deletedCount: number;
  }> {
    return this._http.delete<{ success: boolean; deletedCount: number }>(
      `${this.baseUrl}/finances/transactions`
    );
  }

  // Transfers
  getAllTransfers(): Observable<Transfer[]> {
    return this._http.get<Transfer[]>(`${this.baseUrl}/finances/transfers`);
  }

  getTransfer(id: string): Observable<Transfer> {
    return this._http.get<Transfer>(`${this.baseUrl}/finances/transfers/${id}`);
  }

  createTransfer(transfer: TransferInput): Observable<Transfer> {
    return this._http.post<Transfer>(
      `${this.baseUrl}/finances/transfers`,
      transfer
    );
  }

  updateTransfer(id: string, transfer: TransferInput): Observable<Transfer> {
    return this._http.put<Transfer>(
      `${this.baseUrl}/finances/transfers/${id}`,
      transfer
    );
  }

  deleteTransfer(id: string): Observable<{ success: boolean }> {
    return this._http.delete<{ success: boolean }>(
      `${this.baseUrl}/finances/transfers/${id}`
    );
  }

  deleteAllTransfers(): Observable<{ success: boolean; deletedCount: number }> {
    return this._http.delete<{ success: boolean; deletedCount: number }>(
      `${this.baseUrl}/finances/transfers`
    );
  }

  // Categories
  getAllCategories(): Observable<string[]> {
    return this._http.get<string[]>(`${this.baseUrl}/finances/categories`);
  }

  getCategory(name: string): Observable<Category> {
    return this._http.get<Category>(
      `${this.baseUrl}/finances/categories/${name}`
    );
  }

  createCategory(category: CategoryInput): Observable<Category> {
    return this._http.post<Category>(
      `${this.baseUrl}/finances/categories`,
      category
    );
  }

  updateCategory(name: string, category: CategoryInput): Observable<Category> {
    return this._http.put<Category>(
      `${this.baseUrl}/finances/categories/${name}`,
      category
    );
  }

  deleteCategory(name: string): Observable<Category> {
    return this._http.delete<Category>(
      `${this.baseUrl}/finances/categories/${name}`
    );
  }

  deleteAllCategories(): Observable<{ deletedCount: number }> {
    return this._http.delete<{ deletedCount: number }>(
      `${this.baseUrl}/finances/categories`
    );
  }

  // Tags
  getAllTags(): Observable<string[]> {
    return this._http.get<string[]>(`${this.baseUrl}/finances/tags`);
  }

  getTag(name: string): Observable<Tag> {
    return this._http.get<Tag>(`${this.baseUrl}/finances/tags/${name}`);
  }

  createTag(tag: TagInput): Observable<Tag> {
    return this._http.post<Tag>(`${this.baseUrl}/finances/tags`, tag);
  }

  updateTag(name: string, tag: TagInput): Observable<Tag> {
    return this._http.put<Tag>(`${this.baseUrl}/finances/tags/${name}`, tag);
  }

  deleteTag(name: string): Observable<Tag> {
    return this._http.delete<Tag>(`${this.baseUrl}/finances/tags/${name}`);
  }

  deleteAllTags(): Observable<{ deletedCount: number }> {
    return this._http.delete<{ deletedCount: number }>(
      `${this.baseUrl}/finances/tags`
    );
  }

  // User Profile
  getProfile() {
    return this._http.get<{
      success: boolean;
      user: User;
      credentials: Array<any>;
    }>(`${this.baseUrl}/users/profile`);
  }

  updateProfile(updates: { name?: string }): Observable<User> {
    return this._http.put<User>(`${this.baseUrl}/users/profile`, updates);
  }

  deleteUserAccount(): Observable<{ success: boolean; message: string }> {
    return this._http.delete<{ success: boolean; message: string }>(
      `${this.baseUrl}/users/profile`
    );
  }

  // Auth
  logout(
    refreshToken?: string
  ): Observable<{ success: boolean; message: string }> {
    return this._http.post<{ success: boolean; message: string }>(
      `${this.baseUrl}/users/logout`,
      { refreshToken }
    );
  }

  // Overview APIs
  getAllTimeOverview(): Observable<AllTimeOverview> {
    return this._http.get<AllTimeOverview>(
      `${this.baseUrl}/finances/overview/all-time`
    );
  }

  getMonthlyHabitsOverview(
    year: number,
    month: number
  ): Observable<MonthlyHabitsOverview> {
    return this._http.get<MonthlyHabitsOverview>(
      `${this.baseUrl}/finances/overview/monthly/${year}/${month + 1}` // Convert from 0-based to 1-based month
    );
  }

  getCurrentMonthOverview(): Observable<MonthlyHabitsOverview> {
    return this._http.get<MonthlyHabitsOverview>(
      `${this.baseUrl}/finances/overview/monthly/current`
    );
  }

  getNetWorth(): Observable<NetWorthData> {
    return this._http.get<NetWorthData>(
      `${this.baseUrl}/finances/overview/net-worth`
    );
  }

  getFinancialHealthScore(): Observable<FinancialHealthScore> {
    return this._http.get<FinancialHealthScore>(
      `${this.baseUrl}/finances/overview/health-score`
    );
  }
}
