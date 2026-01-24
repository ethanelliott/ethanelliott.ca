import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import {
  FinanceApiService,
  Transaction,
  Account,
  Category,
  Tag,
  TransactionType,
  TransactionFilters,
} from '../../services/finance-api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-transactions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatPaginatorModule,
  ],
  styleUrl: './transactions.component.scss',
  template: `
    <div class="transactions-container">
      <div class="page-content">
        <!-- Header -->
        <div class="page-header">
          <div class="header-stats">
            <span>{{ filteredTransactions().length }} transactions</span>
            @if (stats()) {
              <span class="stat-income">+{{ formatCurrency(stats()!.totalIncome) }}</span>
              <span class="stat-expense">-{{ formatCurrency(stats()!.totalExpenses) }}</span>
            }
          </div>
          <div class="header-actions">
            @if (stats()?.unreviewedCount) {
              <button mat-stroked-button routerLink="/dashboard/inbox">
                <mat-icon>inbox</mat-icon>
                {{ stats()!.unreviewedCount }} to review
              </button>
            }
          </div>
        </div>

        <!-- Filters -->
        <mat-card class="filters-card">
          <mat-card-content>
            <div class="filters-row">
              <mat-form-field appearance="outline" class="search-field">
                <mat-label>Search</mat-label>
                <mat-icon matPrefix>search</mat-icon>
                <input matInput [(ngModel)]="searchQuery" (input)="applyFilters()" placeholder="Search transactions...">
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Account</mat-label>
                <mat-select [(ngModel)]="selectedAccountId" (selectionChange)="applyFilters()">
                  <mat-option [value]="null">All Accounts</mat-option>
                  @for (account of accounts(); track account.id) {
                    <mat-option [value]="account.id">{{ account.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Category</mat-label>
                <mat-select [(ngModel)]="selectedCategoryId" (selectionChange)="applyFilters()">
                  <mat-option [value]="null">All Categories</mat-option>
                  @for (category of categories(); track category.id) {
                    <mat-option [value]="category.id">{{ category.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Type</mat-label>
                <mat-select [(ngModel)]="selectedType" (selectionChange)="applyFilters()">
                  <mat-option [value]="null">All Types</mat-option>
                  <mat-option [value]="TransactionType.INCOME">Income</mat-option>
                  <mat-option [value]="TransactionType.EXPENSE">Expense</mat-option>
                  <mat-option [value]="TransactionType.TRANSFER">Transfer</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="date-field">
                <mat-label>Start Date</mat-label>
                <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate" (dateChange)="applyFilters()">
                <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
                <mat-datepicker #startPicker></mat-datepicker>
              </mat-form-field>

              <mat-form-field appearance="outline" class="date-field">
                <mat-label>End Date</mat-label>
                <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate" (dateChange)="applyFilters()">
                <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
                <mat-datepicker #endPicker></mat-datepicker>
              </mat-form-field>

              @if (hasActiveFilters()) {
                <button mat-icon-button (click)="clearFilters()" matTooltip="Clear filters">
                  <mat-icon>clear</mat-icon>
                </button>
              }
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Transactions List -->
        <mat-card class="transactions-card">
          <mat-card-content>
            @if (loading()) {
              <div class="loading-container">
                <mat-spinner></mat-spinner>
                <h3>Loading transactions...</h3>
              </div>
            } @else if (paginatedTransactions().length === 0) {
              <div class="empty-state">
                <mat-icon>receipt</mat-icon>
                <h3>No transactions found</h3>
                <p>
                  @if (hasActiveFilters()) {
                    No transactions match your current filters
                  } @else {
                    Connect a bank account to start seeing your transactions
                  }
                </p>
                @if (hasActiveFilters()) {
                  <button mat-raised-button color="primary" (click)="clearFilters()">
                    Clear Filters
                  </button>
                } @else {
                  <button mat-raised-button color="primary" routerLink="/dashboard/accounts">
                    Connect Bank Account
                  </button>
                }
              </div>
            } @else {
              <div class="transactions-list">
                @for (tx of paginatedTransactions(); track tx.id) {
                  <div class="transaction-item" [class.pending]="tx.pending" [class.transfer]="tx.type === TransactionType.TRANSFER">
                    <div class="tx-date">
                      <span class="date-day">{{ formatDay(tx.date) }}</span>
                      <span class="date-month">{{ formatMonth(tx.date) }}</span>
                    </div>
                    <div class="tx-icon" [class]="getTypeClass(tx)">
                      <mat-icon>{{ getTypeIcon(tx) }}</mat-icon>
                    </div>
                    <div class="tx-details">
                      <div class="tx-name">
                        {{ tx.merchantName || tx.name }}
                        @if (tx.pending) {
                          <span class="pending-badge">Pending</span>
                        }
                      </div>
                      <div class="tx-meta">
                        <span class="tx-account">{{ tx.accountName }}</span>
                        @if (tx.category) {
                          <span class="tx-category" [style.background-color]="tx.categoryColor || '#666'">
                            {{ getCategoryName(tx.category) }}
                          </span>
                        }
                        @if (tx.tags && tx.tags.length > 0) {
                          @for (tagId of tx.tags.slice(0, 2); track tagId) {
                            <span class="tx-tag">{{ getTagName(tagId) }}</span>
                          }
                          @if (tx.tags.length > 2) {
                            <span class="tx-tag-more">+{{ tx.tags.length - 2 }}</span>
                          }
                        }
                      </div>
                    </div>
                    <div class="tx-amount" [class]="getAmountClass(tx)">
                      {{ formatAmount(tx) }}
                    </div>
                    <div class="tx-status">
                      @if (!tx.isReviewed) {
                        <mat-icon class="unreviewed-icon" matTooltip="Not reviewed">fiber_new</mat-icon>
                      }
                      @if (tx.linkedTransferId) {
                        <mat-icon class="transfer-icon" matTooltip="Transfer">swap_horiz</mat-icon>
                      }
                    </div>
                  </div>
                }
              </div>

              <mat-paginator
                [length]="filteredTransactions().length"
                [pageSize]="pageSize"
                [pageSizeOptions]="[25, 50, 100]"
                [pageIndex]="pageIndex"
                (page)="onPageChange($event)"
              ></mat-paginator>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
})
export class TransactionsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);

  readonly TransactionType = TransactionType;

  loading = signal(true);
  transactions = signal<Transaction[]>([]);
  accounts = signal<Account[]>([]);
  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);
  stats = signal<{
    totalIncome: number;
    totalExpenses: number;
    unreviewedCount: number;
  } | null>(null);

  // Filter state
  searchQuery = '';
  selectedAccountId: string | null = null;
  selectedCategoryId: string | null = null;
  selectedType: TransactionType | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;

  // Pagination
  pageIndex = 0;
  pageSize = 50;

  // Computed filtered transactions
  filteredTransactions = signal<Transaction[]>([]);

  paginatedTransactions = computed(() => {
    const filtered = this.filteredTransactions();
    const start = this.pageIndex * this.pageSize;
    return filtered.slice(start, start + this.pageSize);
  });

  ngOnInit() {
    this.loadData();
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const [transactions, accounts, categories, tags, stats] = await Promise.all([
        firstValueFrom(this.apiService.getAllTransactions()),
        firstValueFrom(this.apiService.getAllAccounts()),
        firstValueFrom(this.apiService.getAllCategories()),
        firstValueFrom(this.apiService.getAllTags()),
        firstValueFrom(this.apiService.getTransactionStats()),
      ]);
      this.transactions.set(transactions);
      this.filteredTransactions.set(transactions);
      this.accounts.set(accounts);
      this.categories.set(categories);
      this.tags.set(tags);
      this.stats.set({
        totalIncome: stats.totalIncome,
        totalExpenses: stats.totalExpenses,
        unreviewedCount: stats.unreviewedCount,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilters() {
    let filtered = this.transactions();

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(tx =>
        tx.name.toLowerCase().includes(query) ||
        (tx.merchantName && tx.merchantName.toLowerCase().includes(query)) ||
        (tx.notes && tx.notes.toLowerCase().includes(query))
      );
    }

    if (this.selectedAccountId) {
      filtered = filtered.filter(tx => tx.accountId === this.selectedAccountId);
    }

    if (this.selectedCategoryId) {
      filtered = filtered.filter(tx => tx.category === this.selectedCategoryId);
    }

    if (this.selectedType) {
      filtered = filtered.filter(tx => tx.type === this.selectedType);
    }

    if (this.startDate) {
      const start = this.startDate.toISOString().split('T')[0];
      filtered = filtered.filter(tx => tx.date >= start);
    }

    if (this.endDate) {
      const end = this.endDate.toISOString().split('T')[0];
      filtered = filtered.filter(tx => tx.date <= end);
    }

    this.filteredTransactions.set(filtered);
    this.pageIndex = 0;
  }

  hasActiveFilters(): boolean {
    return !!(
      this.searchQuery ||
      this.selectedAccountId ||
      this.selectedCategoryId ||
      this.selectedType ||
      this.startDate ||
      this.endDate
    );
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedAccountId = null;
    this.selectedCategoryId = null;
    this.selectedType = null;
    this.startDate = null;
    this.endDate = null;
    this.filteredTransactions.set(this.transactions());
    this.pageIndex = 0;
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories().find(c => c.id === categoryId);
    return category?.name || 'Unknown';
  }

  getTagName(tagId: string): string {
    const tag = this.tags().find(t => t.id === tagId);
    return tag?.name || 'Unknown';
  }

  getTypeClass(tx: Transaction): string {
    switch (tx.type) {
      case TransactionType.INCOME:
        return 'income';
      case TransactionType.EXPENSE:
        return 'expense';
      case TransactionType.TRANSFER:
        return 'transfer';
      default:
        return '';
    }
  }

  getTypeIcon(tx: Transaction): string {
    switch (tx.type) {
      case TransactionType.INCOME:
        return 'arrow_downward';
      case TransactionType.EXPENSE:
        return 'arrow_upward';
      case TransactionType.TRANSFER:
        return 'swap_horiz';
      default:
        return 'receipt';
    }
  }

  getAmountClass(tx: Transaction): string {
    switch (tx.type) {
      case TransactionType.INCOME:
        return 'positive';
      case TransactionType.EXPENSE:
        return 'negative';
      default:
        return '';
    }
  }

  formatAmount(tx: Transaction): string {
    const abs = Math.abs(tx.amount);
    const formatted = this.formatCurrency(abs);
    switch (tx.type) {
      case TransactionType.INCOME:
        return '+' + formatted;
      case TransactionType.EXPENSE:
        return '-' + formatted;
      default:
        return formatted;
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  }

  formatDay(dateStr: string): string {
    const date = new Date(dateStr);
    return date.getDate().toString();
  }

  formatMonth(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short' });
  }
}
