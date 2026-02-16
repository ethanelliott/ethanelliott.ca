import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ==================== Plaid Types ====================

export enum PlaidItemStatus {
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR',
  PENDING_EXPIRATION = 'PENDING_EXPIRATION',
  REVOKED = 'REVOKED',
}

export interface PlaidItem {
  id: string;
  itemId: string;
  institutionId: string | null;
  institutionName: string | null;
  institutionLogo: string | null;
  institutionColor: string | null;
  status: PlaidItemStatus;
  lastSyncAt: Date | null;
  lastError: string | null;
  consentExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkTokenResponse {
  linkToken: string;
  expiration: string;
}

export interface ExchangeTokenResponse {
  success: boolean;
  item: PlaidItem;
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  accountsUpdated: number;
}

export interface SyncLog {
  id: string;
  plaidItemId: string;
  institutionName: string | null;
  syncType: string;
  status: string;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsRemoved: number;
  accountsUpdated: number;
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
}

// ==================== Account Types ====================

export enum AccountType {
  DEPOSITORY = 'depository',
  CREDIT = 'credit',
  LOAN = 'loan',
  INVESTMENT = 'investment',
  BROKERAGE = 'brokerage',
  OTHER = 'other',
}

export interface Account {
  id: string;
  plaidAccountId: string;
  plaidItemId: string;
  institutionName: string | null;
  institutionLogo: string | null;
  institutionColor: string | null;
  name: string;
  officialName: string | null;
  type: AccountType;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  limitAmount: number | null;
  isoCurrencyCode: string;
  lastBalanceUpdate: Date | null;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountsByInstitution {
  institutionId: string | null;
  institutionName: string;
  institutionLogo: string | null;
  institutionColor: string | null;
  accounts: Account[];
  totalBalance: number;
}

export interface AccountSummary {
  totalAccounts: number;
  visibleAccounts: number;
  totalBalance: number;
  totalAvailable: number;
  byType: Record<string, { count: number; balance: number }>;
}

// ==================== Transaction Types ====================

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
}

export interface Transaction {
  id: string;
  plaidTransactionId: string;
  accountId: string;
  accountName: string;
  institutionName: string | null;
  date: string;
  authorizedDate: Date | null;
  amount: number;
  type: TransactionType;
  name: string;
  merchantName: string | null;
  plaidCategory: string | null;
  plaidPersonalFinanceCategory: string | null;
  category: string | null;
  categoryColor: string | null;
  tags: string[];
  notes: string | null;
  pending: boolean;
  isReviewed: boolean;
  linkedTransferId: string | null;
  linkedTransferConfidence: number | null;
  paymentChannel: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  isoCurrencyCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionUpdate {
  category?: string | null;
  tags?: string[];
  notes?: string | null;
  isReviewed?: boolean;
  linkedTransferId?: string | null;
}

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

export interface TransactionStats {
  totalTransactions: number;
  unreviewedCount: number;
  totalIncome: number;
  totalExpenses: number;
  totalTransfers: number;
  linkedTransferCount: number;
  unlinkedTransferCount: number;
  byCategory: Array<{ category: string; amount: number; count: number }>;
}

export interface TransferSuggestion extends Transaction {
  confidence: number;
}

// ==================== Category Types ====================

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  plaidCategoryMapping: string | null;
  sortOrder: number;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface CategoryUsage {
  categoryId: string;
  name: string;
  transactionCount: number;
}

// ==================== Tag Types ====================

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TagInput {
  name: string;
  description?: string;
  color?: string;
}

export interface TagUsage {
  tagId: string;
  name: string;
  transactionCount: number;
}

// ==================== Overview Types ====================

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

export interface MonthlyTrend {
  month: string;
  income: number;
  expenses: number;
  netCashFlow: number;
}

// ==================== User Types ====================

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
  private readonly baseUrl = environment.apiUrl;

  // ==================== Plaid ====================

  getPlaidStatus(): Observable<{ configured: boolean; environment: string }> {
    return this._http.get<{ configured: boolean; environment: string }>(
      `${this.baseUrl}/finances/plaid/status`
    );
  }

  createLinkToken(): Observable<LinkTokenResponse> {
    return this._http.post<LinkTokenResponse>(
      `${this.baseUrl}/finances/plaid/link-token`,
      {}
    );
  }

  createUpdateLinkToken(itemId: string): Observable<LinkTokenResponse> {
    return this._http.post<LinkTokenResponse>(
      `${this.baseUrl}/finances/plaid/link-token/${itemId}`,
      {}
    );
  }

  exchangeToken(
    publicToken: string,
    institutionId?: string,
    institutionName?: string
  ): Observable<ExchangeTokenResponse> {
    return this._http.post<ExchangeTokenResponse>(
      `${this.baseUrl}/finances/plaid/exchange-token`,
      { publicToken, institutionId, institutionName }
    );
  }

  getPlaidItems(): Observable<PlaidItem[]> {
    return this._http.get<PlaidItem[]>(`${this.baseUrl}/finances/plaid/items`);
  }

  getPlaidItem(itemId: string): Observable<PlaidItem> {
    return this._http.get<PlaidItem>(
      `${this.baseUrl}/finances/plaid/items/${itemId}`
    );
  }

  removePlaidItem(itemId: string): Observable<{ success: boolean }> {
    return this._http.delete<{ success: boolean }>(
      `${this.baseUrl}/finances/plaid/items/${itemId}`
    );
  }

  syncItem(itemId: string): Observable<SyncResult> {
    return this._http.post<SyncResult>(
      `${this.baseUrl}/finances/plaid/items/${itemId}/sync`,
      {}
    );
  }

  syncAllItems(): Observable<{
    success: boolean;
    results: Record<string, SyncResult>;
  }> {
    return this._http.post<{
      success: boolean;
      results: Record<string, SyncResult>;
    }>(`${this.baseUrl}/finances/plaid/sync-all`, {});
  }

  getSyncLogs(limit?: number): Observable<SyncLog[]> {
    let params = new HttpParams();
    if (limit) {
      params = params.set('limit', limit.toString());
    }
    return this._http.get<SyncLog[]>(
      `${this.baseUrl}/finances/plaid/sync-logs`,
      { params }
    );
  }

  // ==================== Accounts ====================

  getAllAccounts(visibleOnly = false): Observable<Account[]> {
    let params = new HttpParams();
    if (visibleOnly) {
      params = params.set('visibleOnly', 'true');
    }
    return this._http.get<Account[]>(`${this.baseUrl}/finances/accounts`, {
      params,
    });
  }

  getAccountsByInstitution(): Observable<AccountsByInstitution[]> {
    return this._http.get<AccountsByInstitution[]>(
      `${this.baseUrl}/finances/accounts/by-institution`
    );
  }

  getAccountSummary(): Observable<AccountSummary> {
    return this._http.get<AccountSummary>(
      `${this.baseUrl}/finances/accounts/summary`
    );
  }

  getAccount(id: string): Observable<Account> {
    return this._http.get<Account>(`${this.baseUrl}/finances/accounts/${id}`);
  }

  updateAccountVisibility(id: string, isVisible: boolean): Observable<Account> {
    return this._http.patch<Account>(
      `${this.baseUrl}/finances/accounts/${id}`,
      { isVisible }
    );
  }

  // ==================== Transactions ====================

  getAllTransactions(filters?: TransactionFilters): Observable<Transaction[]> {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params = params.set(key, value.toString());
        }
      });
    }
    return this._http.get<Transaction[]>(
      `${this.baseUrl}/finances/transactions`,
      { params }
    );
  }

  getInboxTransactions(): Observable<Transaction[]> {
    return this._http.get<Transaction[]>(
      `${this.baseUrl}/finances/transactions/inbox`
    );
  }

  getTransactionStats(
    startDate?: string,
    endDate?: string
  ): Observable<TransactionStats> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);
    return this._http.get<TransactionStats>(
      `${this.baseUrl}/finances/transactions/stats`,
      { params }
    );
  }

  getTransaction(id: string): Observable<Transaction> {
    return this._http.get<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}`
    );
  }

  updateTransaction(
    id: string,
    update: TransactionUpdate
  ): Observable<Transaction> {
    return this._http.patch<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}`,
      update
    );
  }

  markTransactionReviewed(id: string): Observable<Transaction> {
    return this._http.post<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}/review`,
      {}
    );
  }

  getLinkedTransfer(id: string): Observable<Transaction | null> {
    return this._http.get<Transaction | null>(
      `${this.baseUrl}/finances/transactions/${id}/linked-transfer`
    );
  }

  linkTransfer(
    id: string,
    targetTransactionId: string
  ): Observable<Transaction> {
    return this._http.post<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}/link-transfer`,
      { targetTransactionId }
    );
  }

  unlinkTransfer(id: string): Observable<Transaction> {
    return this._http.delete<Transaction>(
      `${this.baseUrl}/finances/transactions/${id}/link-transfer`
    );
  }

  getTransferSuggestions(id: string): Observable<TransferSuggestion[]> {
    return this._http.get<TransferSuggestion[]>(
      `${this.baseUrl}/finances/transactions/${id}/transfer-suggestions`
    );
  }

  bulkReviewTransactions(
    transactionIds: string[],
    update?: { category?: string | null; tags?: string[] }
  ): Observable<{ updated: number }> {
    return this._http.post<{ updated: number }>(
      `${this.baseUrl}/finances/transactions/bulk/review`,
      { transactionIds, ...update }
    );
  }

  bulkMarkReviewed(transactionIds: string[]): Observable<{ updated: number }> {
    return this._http.post<{ updated: number }>(
      `${this.baseUrl}/finances/transactions/bulk/mark-reviewed`,
      { transactionIds }
    );
  }

  // ==================== Categories ====================

  getAllCategories(): Observable<Category[]> {
    return this._http.get<Category[]>(`${this.baseUrl}/finances/categories`);
  }

  getCategoryUsage(): Observable<CategoryUsage[]> {
    return this._http.get<CategoryUsage[]>(
      `${this.baseUrl}/finances/categories/usage`
    );
  }

  createCategory(category: CategoryInput): Observable<Category> {
    return this._http.post<Category>(
      `${this.baseUrl}/finances/categories`,
      category
    );
  }

  seedDefaultCategories(): Observable<{ created: number }> {
    return this._http.post<{ created: number }>(
      `${this.baseUrl}/finances/categories/seed-defaults`,
      {}
    );
  }

  getCategory(id: string): Observable<Category> {
    return this._http.get<Category>(
      `${this.baseUrl}/finances/categories/${id}`
    );
  }

  updateCategory(
    id: string,
    category: Partial<CategoryInput>
  ): Observable<Category> {
    return this._http.patch<Category>(
      `${this.baseUrl}/finances/categories/${id}`,
      category
    );
  }

  deleteCategory(id: string): Observable<{ success: boolean }> {
    return this._http.delete<{ success: boolean }>(
      `${this.baseUrl}/finances/categories/${id}`
    );
  }

  // ==================== Tags ====================

  getAllTags(): Observable<Tag[]> {
    return this._http.get<Tag[]>(`${this.baseUrl}/finances/tags`);
  }

  getTagUsage(): Observable<TagUsage[]> {
    return this._http.get<TagUsage[]>(`${this.baseUrl}/finances/tags/usage`);
  }

  createTag(tag: TagInput): Observable<Tag> {
    return this._http.post<Tag>(`${this.baseUrl}/finances/tags`, tag);
  }

  getTag(id: string): Observable<Tag> {
    return this._http.get<Tag>(`${this.baseUrl}/finances/tags/${id}`);
  }

  updateTag(id: string, tag: Partial<TagInput>): Observable<Tag> {
    return this._http.patch<Tag>(`${this.baseUrl}/finances/tags/${id}`, tag);
  }

  deleteTag(id: string): Observable<{ success: boolean }> {
    return this._http.delete<{ success: boolean }>(
      `${this.baseUrl}/finances/tags/${id}`
    );
  }

  // ==================== Overview ====================

  getDashboard(): Observable<DashboardSummary> {
    return this._http.get<DashboardSummary>(
      `${this.baseUrl}/finances/overview/dashboard`
    );
  }

  getNetWorth(): Observable<NetWorthSummary> {
    return this._http.get<NetWorthSummary>(
      `${this.baseUrl}/finances/overview/net-worth`
    );
  }

  getSpending(startDate: string, endDate: string): Observable<SpendingSummary> {
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate);
    return this._http.get<SpendingSummary>(
      `${this.baseUrl}/finances/overview/spending`,
      { params }
    );
  }

  getMonthlyTrends(months?: number): Observable<MonthlyTrend[]> {
    let params = new HttpParams();
    if (months) {
      params = params.set('months', months.toString());
    }
    return this._http.get<MonthlyTrend[]>(
      `${this.baseUrl}/finances/overview/monthly-trends`,
      { params }
    );
  }

  // ==================== User Profile ====================

  getProfile(): Observable<{
    success: boolean;
    user: User;
    credentials: Array<any>;
  }> {
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

  logout(
    refreshToken?: string
  ): Observable<{ success: boolean; message: string }> {
    return this._http.post<{ success: boolean; message: string }>(
      `${this.baseUrl}/users/logout`,
      { refreshToken }
    );
  }
}
