import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import {
  FinanceApiService,
  Transaction,
} from '../../services/finance-api.service';

interface OverviewStats {
  totalIncome: number;
  totalExpenses: number;
  netWorth: number;
  transactionCount: number;
  topCategory: string;
  topMedium: string;
}

@Component({
  selector: 'app-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="overview-container">
      <div class="overview-header">
        <h1 class="page-title">Financial Overview</h1>
        <p class="page-subtitle">
          Get a comprehensive view of your financial health
        </p>
      </div>

      @if (loading()) {
      <div class="loading-container">
        <mat-spinner></mat-spinner>
        <p>Loading your financial data...</p>
      </div>
      } @else {
      <!-- Quick Stats Cards -->
      <div class="stats-grid">
        <mat-card class="stat-card income-card">
          <mat-card-content>
            <div class="stat-content">
              <div class="stat-info">
                <div class="stat-label">Total Income</div>
                <div class="stat-value income">
                  {{ formatCurrency(stats().totalIncome) }}
                </div>
              </div>
              <div class="stat-icon income-icon">
                <mat-icon>trending_up</mat-icon>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card expense-card">
          <mat-card-content>
            <div class="stat-content">
              <div class="stat-info">
                <div class="stat-label">Total Expenses</div>
                <div class="stat-value expense">
                  {{ formatCurrency(stats().totalExpenses) }}
                </div>
              </div>
              <div class="stat-icon expense-icon">
                <mat-icon>trending_down</mat-icon>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card net-worth-card">
          <mat-card-content>
            <div class="stat-content">
              <div class="stat-info">
                <div class="stat-label">Net Worth</div>
                <div
                  class="stat-value"
                  [class]="stats().netWorth >= 0 ? 'positive' : 'negative'"
                >
                  {{ formatCurrency(stats().netWorth) }}
                </div>
              </div>
              <div class="stat-icon net-worth-icon">
                <mat-icon>{{
                  stats().netWorth >= 0 ? 'account_balance' : 'warning'
                }}</mat-icon>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card transaction-card">
          <mat-card-content>
            <div class="stat-content">
              <div class="stat-info">
                <div class="stat-label">Total Transactions</div>
                <div class="stat-value">{{ stats().transactionCount }}</div>
              </div>
              <div class="stat-icon transaction-icon">
                <mat-icon>receipt_long</mat-icon>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions-section">
        <mat-card class="quick-actions-card">
          <mat-card-header>
            <mat-card-title>Quick Actions</mat-card-title>
            <mat-card-subtitle
              >Manage your finances efficiently</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            <div class="actions-grid">
              <button
                mat-raised-button
                color="primary"
                (click)="navigateToTransactions()"
                class="action-button"
              >
                <mat-icon>add</mat-icon>
                Add Transaction
              </button>
              <button
                mat-raised-button
                color="accent"
                (click)="navigateToCategories()"
                class="action-button"
              >
                <mat-icon>category</mat-icon>
                Manage Categories
              </button>
              <button
                mat-raised-button
                (click)="navigateToMediums()"
                class="action-button"
              >
                <mat-icon>payment</mat-icon>
                Payment Methods
              </button>
              <button
                mat-raised-button
                (click)="navigateToTags()"
                class="action-button"
              >
                <mat-icon>local_offer</mat-icon>
                Manage Tags
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Insights -->
      <div class="insights-section">
        <div class="insights-grid">
          <mat-card class="insight-card">
            <mat-card-header>
              <mat-card-title>Top Category</mat-card-title>
              <mat-card-subtitle>Most used expense category</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="insight-content">
                <mat-icon class="insight-icon">category</mat-icon>
                <span class="insight-value">{{
                  stats().topCategory || 'No data'
                }}</span>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card class="insight-card">
            <mat-card-header>
              <mat-card-title>Preferred Payment</mat-card-title>
              <mat-card-subtitle>Most used payment method</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="insight-content">
                <mat-icon class="insight-icon">payment</mat-icon>
                <span class="insight-value">{{
                  stats().topMedium || 'No data'
                }}</span>
              </div>
            </mat-card-content>
          </mat-card>
        </div>
      </div>

      <!-- Recent Transactions Preview -->
      <div class="recent-transactions-section">
        <mat-card class="recent-transactions-card">
          <mat-card-header>
            <mat-card-title>Recent Transactions</mat-card-title>
            <mat-card-subtitle>Latest 5 transactions</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (recentTransactions().length === 0) {
            <div class="empty-state">
              <mat-icon>receipt_long</mat-icon>
              <p>
                No transactions yet.
                <a (click)="navigateToTransactions()"
                  >Add your first transaction</a
                >
              </p>
            </div>
            } @else {
            <div class="transactions-list">
              @for (transaction of recentTransactions(); track transaction.id) {
              <div class="transaction-item">
                <div class="transaction-info">
                  <div class="transaction-description">
                    {{ transaction.description }}
                  </div>
                  <div class="transaction-meta">
                    {{ transaction.category }} • {{ transaction.medium }} •
                    {{ formatDate(transaction.date) }}
                  </div>
                </div>
                <div
                  class="transaction-amount"
                  [class]="transaction.type.toLowerCase()"
                >
                  {{ transaction.type === 'INCOME' ? '+' : '-'
                  }}{{ formatCurrency(transaction.amount) }}
                </div>
              </div>
              }
            </div>
            <div class="view-all-container">
              <button
                mat-button
                color="primary"
                (click)="navigateToTransactions()"
              >
                View All Transactions
                <mat-icon>arrow_forward</mat-icon>
              </button>
            </div>
            }
          </mat-card-content>
        </mat-card>
      </div>
      }
    </div>
  `,
  styles: `
    .overview-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 16px;
    }

    .overview-header {
      margin-bottom: 32px;
      text-align: center;
    }

    .page-title {
      font-size: 2.5rem;
      font-weight: 300;
      margin: 0;
      color: var(--mat-primary-color);
      background: linear-gradient(135deg, var(--mat-primary-color), var(--mat-secondary-color));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .page-subtitle {
      font-size: 1.1rem;
      color: var(--mat-secondary-text-color);
      margin: 8px 0 0 0;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      gap: 16px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }

    .stat-card {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }

    .stat-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-info {
      flex: 1;
    }

    .stat-label {
      font-size: 0.875rem;
      color: var(--mat-secondary-text-color);
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 600;
      line-height: 1;
    }

    .stat-value.income {
      color: var(--mat-success-color, #4caf50);
    }

    .stat-value.expense {
      color: var(--mat-error-color, #f44336);
    }

    .stat-value.positive {
      color: var(--mat-success-color, #4caf50);
    }

    .stat-value.negative {
      color: var(--mat-error-color, #f44336);
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stat-icon mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .income-icon {
      background: linear-gradient(135deg, #4caf50, #66bb6a);
      color: white;
    }

    .expense-icon {
      background: linear-gradient(135deg, #f44336, #ef5350);
      color: white;
    }

    .net-worth-icon {
      background: linear-gradient(135deg, var(--mat-primary-color), var(--mat-secondary-color));
      color: white;
    }

    .transaction-icon {
      background: linear-gradient(135deg, #ff9800, #ffb74d);
      color: white;
    }

    .quick-actions-section {
      margin-bottom: 32px;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .action-button {
      padding: 16px;
      height: auto;
      flex-direction: column;
      gap: 8px;
    }

    .action-button mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .insights-section {
      margin-bottom: 32px;
    }

    .insights-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }

    .insight-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .insight-icon {
      color: var(--mat-primary-color);
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .insight-value {
      font-size: 1.25rem;
      font-weight: 500;
      text-transform: capitalize;
    }

    .recent-transactions-section {
      margin-bottom: 32px;
    }

    .empty-state {
      text-align: center;
      padding: 32px;
      color: var(--mat-secondary-text-color);
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state a {
      color: var(--mat-primary-color);
      cursor: pointer;
      text-decoration: none;
    }

    .empty-state a:hover {
      text-decoration: underline;
    }

    .transactions-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .transaction-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid var(--mat-divider-color);
    }

    .transaction-item:last-child {
      border-bottom: none;
    }

    .transaction-info {
      flex: 1;
    }

    .transaction-description {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .transaction-meta {
      font-size: 0.875rem;
      color: var(--mat-secondary-text-color);
    }

    .transaction-amount {
      font-weight: 600;
      font-size: 1.1rem;
    }

    .transaction-amount.income {
      color: var(--mat-success-color, #4caf50);
    }

    .transaction-amount.expense {
      color: var(--mat-error-color, #f44336);
    }

    .view-all-container {
      margin-top: 16px;
      text-align: center;
    }

    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
      
      .actions-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .insights-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class OverviewComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly router = inject(Router);

  loading = signal(true);
  transactions = signal<Transaction[]>([]);
  stats = signal<OverviewStats>({
    totalIncome: 0,
    totalExpenses: 0,
    netWorth: 0,
    transactionCount: 0,
    topCategory: '',
    topMedium: '',
  });
  recentTransactions = signal<Transaction[]>([]);

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.apiService.getAllTransactions().subscribe({
      next: (transactions) => {
        this.transactions.set(transactions);
        this.calculateStats(transactions);
        this.setRecentTransactions(transactions);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading transactions:', error);
        this.loading.set(false);
      },
    });
  }

  private calculateStats(transactions: Transaction[]) {
    const income = transactions
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0);

    // Find most common category and medium
    const categoryCount = new Map<string, number>();
    const mediumCount = new Map<string, number>();

    transactions.forEach((t) => {
      if (t.type === 'EXPENSE') {
        // Only count expense categories for "top category"
        categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
      }
      mediumCount.set(t.medium, (mediumCount.get(t.medium) || 0) + 1);
    });

    const topCategory =
      [...categoryCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const topMedium =
      [...mediumCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    this.stats.set({
      totalIncome: income,
      totalExpenses: expenses,
      netWorth: income - expenses,
      transactionCount: transactions.length,
      topCategory,
      topMedium,
    });
  }

  private setRecentTransactions(transactions: Transaction[]) {
    const recent = transactions
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
    this.recentTransactions.set(recent);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  }

  navigateToTransactions() {
    this.router.navigate(['/dashboard/transactions']);
  }

  navigateToCategories() {
    this.router.navigate(['/dashboard/categories']);
  }

  navigateToMediums() {
    this.router.navigate(['/dashboard/mediums']);
  }

  navigateToTags() {
    this.router.navigate(['/dashboard/tags']);
  }
}
