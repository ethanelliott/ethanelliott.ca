import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  FinanceApiService,
  DashboardSummary,
  MonthlyTrend,
} from '../../services/finance-api.service';

@Component({
  selector: 'app-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="overview-container">
      @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="48"></mat-spinner>
        <p>Loading your financial overview...</p>
      </div>
      } @else if (!dashboard()) {
      <div class="empty-state">
        <mat-icon class="empty-icon">account_balance</mat-icon>
        <h2>Welcome to Your Finances</h2>
        <p>Connect your bank accounts to get started tracking your finances.</p>
        <button
          mat-raised-button
          color="primary"
          routerLink="/dashboard/accounts"
        >
          <mat-icon>add</mat-icon>
          Connect Bank Account
        </button>
      </div>
      } @else {
      <div class="dashboard-grid">
        <!-- Net Worth Card -->
        <mat-card class="stat-card net-worth-card">
          <mat-card-content>
            <div class="stat-header">
              <mat-icon>account_balance_wallet</mat-icon>
              <span>Net Worth</span>
            </div>
            <div
              class="stat-value"
              [class.positive]="dashboard()!.netWorth.netWorth >= 0"
              [class.negative]="dashboard()!.netWorth.netWorth < 0"
            >
              {{ formatCurrency(dashboard()!.netWorth.netWorth) }}
            </div>
            <div class="stat-breakdown">
              <span class="breakdown-item positive">
                <mat-icon>arrow_upward</mat-icon>
                Assets: {{ formatCurrency(dashboard()!.netWorth.totalAssets) }}
              </span>
              <span class="breakdown-item negative">
                <mat-icon>arrow_downward</mat-icon>
                Liabilities:
                {{ formatCurrency(dashboard()!.netWorth.totalLiabilities) }}
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Month Spending Card -->
        <mat-card class="stat-card spending-card">
          <mat-card-content>
            <div class="stat-header">
              <mat-icon>trending_down</mat-icon>
              <span>This Month's Spending</span>
            </div>
            <div class="stat-value negative">
              {{ formatCurrency(dashboard()!.spending.totalExpenses) }}
            </div>
            <div class="stat-subtitle">
              Income:
              <span class="positive">{{
                formatCurrency(dashboard()!.spending.totalIncome)
              }}</span>
            </div>
            <div class="stat-net">
              Net:
              <span
                [class.positive]="dashboard()!.spending.netCashFlow >= 0"
                [class.negative]="dashboard()!.spending.netCashFlow < 0"
              >
                {{ formatCurrency(dashboard()!.spending.netCashFlow) }}
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Inbox Card -->
        <mat-card class="stat-card inbox-card" routerLink="/dashboard/inbox">
          <mat-card-content>
            <div class="stat-header">
              <mat-icon>inbox</mat-icon>
              <span>Inbox</span>
            </div>
            <div class="stat-value">
              {{ dashboard()!.unreviewedCount }}
            </div>
            <div class="stat-subtitle">transactions to review</div>
            @if (dashboard()!.pendingCount > 0) {
            <div class="stat-note">{{ dashboard()!.pendingCount }} pending</div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Connected Banks Card -->
        <mat-card class="stat-card banks-card" routerLink="/dashboard/accounts">
          <mat-card-content>
            <div class="stat-header">
              <mat-icon>account_balance</mat-icon>
              <span>Connected Banks</span>
            </div>
            <div class="stat-value">
              {{ dashboard()!.connectedBanks }}
            </div>
            <div class="stat-subtitle">
              @if (dashboard()!.lastSyncAt) { Last synced
              {{ formatRelativeTime(dashboard()!.lastSyncAt!) }}
              } @else { Never synced }
            </div>
            <button
              mat-stroked-button
              class="sync-button"
              (click)="syncAll($event)"
            >
              @if (syncing()) {
              <mat-spinner diameter="16"></mat-spinner>
              } @else {
              <mat-icon>sync</mat-icon>
              } Sync Now
            </button>
          </mat-card-content>
        </mat-card>

        <!-- Spending by Category -->
        <mat-card class="category-card">
          <mat-card-header>
            <mat-card-title>Spending by Category</mat-card-title>
            <mat-card-subtitle>This month's breakdown</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (dashboard()!.spending.byCategory.length === 0) {
            <div class="no-data">No spending data yet</div>
            } @else {
            <div class="category-list">
              @for (cat of dashboard()!.spending.byCategory.slice(0, 8); track
              cat.category) {
              <div class="category-item">
                <div class="category-row">
                  <div class="category-info">
                    <span class="category-name">{{
                      formatCategoryName(cat.category)
                    }}</span>
                    <span class="category-amount">{{
                      formatCurrency(cat.amount)
                    }}</span>
                  </div>
                  <span class="category-count"
                    >{{ cat.count }}
                    {{ cat.count === 1 ? 'transaction' : 'transactions' }}</span
                  >
                </div>
                <div class="category-bar">
                  <div
                    class="category-bar-fill"
                    [style.width.%]="cat.percentage"
                  ></div>
                </div>
              </div>
              }
            </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Monthly Trends -->
        <mat-card class="trends-card">
          <mat-card-header>
            <mat-card-title>Monthly Trends</mat-card-title>
            <mat-card-subtitle>Last 6 months</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (trends().length === 0) {
            <div class="no-data">No trend data yet</div>
            } @else {
            <div class="trends-list">
              @for (trend of trends(); track trend.month) {
              <div class="trend-item">
                <div class="trend-month">{{ formatMonth(trend.month) }}</div>
                <div class="trend-bars">
                  <div class="trend-bar-row">
                    <div
                      class="trend-bar income"
                      [style.width.%]="
                        getBarWidth(trend.income, maxTrendValue())
                      "
                    ></div>
                    <span class="trend-value">{{
                      formatCurrency(trend.income)
                    }}</span>
                  </div>
                  <div class="trend-bar-row">
                    <div
                      class="trend-bar expenses"
                      [style.width.%]="
                        getBarWidth(trend.expenses, maxTrendValue())
                      "
                    ></div>
                    <span class="trend-value">{{
                      formatCurrency(trend.expenses)
                    }}</span>
                  </div>
                </div>
                <div
                  class="trend-net"
                  [class.positive]="trend.netCashFlow >= 0"
                  [class.negative]="trend.netCashFlow < 0"
                >
                  {{ formatCurrency(trend.netCashFlow) }}
                </div>
              </div>
              }
            </div>
            <div class="trends-legend">
              <span class="legend-item"
                ><span class="legend-color income"></span> Income</span
              >
              <span class="legend-item"
                ><span class="legend-color expenses"></span> Expenses</span
              >
            </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Account Balances -->
        <mat-card class="accounts-card">
          <mat-card-header>
            <mat-card-title>Account Balances</mat-card-title>
            <mat-card-subtitle>Current balances</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (dashboard()!.netWorth.accountBreakdown.length === 0) {
            <div class="no-data">No accounts connected</div>
            } @else {
            <div class="accounts-list">
              @for (account of dashboard()!.netWorth.accountBreakdown; track
              account.accountId) {
              <div class="account-item">
                <div class="account-info">
                  <span class="account-name">{{ account.accountName }}</span>
                  <span class="account-institution">{{
                    account.institutionName || 'Unknown'
                  }}</span>
                </div>
                <div
                  class="account-balance"
                  [class.positive]="account.isAsset"
                  [class.negative]="!account.isAsset"
                >
                  {{ formatCurrency(account.balance) }}
                </div>
              </div>
              }
            </div>
            }
          </mat-card-content>
        </mat-card>
      </div>
      }
    </div>
  `,
  styles: `
    @import 'styles/variables';
    
    .overview-container {
      max-width: var(--content-max-width);
      margin: 0 auto;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 32px;
      gap: 20px;
      
      p {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.95rem;
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 32px;
      text-align: center;
      
      .empty-icon {
        width: 88px;
        height: 88px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(var(--mat-sys-primary-rgb), 0.1);
        margin-bottom: 24px;
        
        mat-icon {
          font-size: 44px;
          width: 44px;
          height: 44px;
          color: var(--mat-sys-primary);
        }
      }
      
      h2 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--mat-sys-on-surface);
        margin: 0 0 8px;
      }
      
      p {
        color: var(--mat-sys-on-surface-variant);
        margin: 0 0 24px;
        max-width: 360px;
      }
    }

    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    mat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      overflow: hidden;
    }

    .stat-card {
      padding: 12px 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      
      mat-card-content {
        padding: 0 !important;
      }
      
      &:hover {
        background: var(--bg-card-hover);
        border-color: rgba(var(--mat-sys-primary-rgb), 0.3);
      }
    }

    .stat-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      
      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--mat-sys-primary);
      }
      
      span {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      margin-bottom: 2px;
      
      &.positive { color: var(--mat-sys-primary); }
      &.negative { color: var(--mat-sys-error); }
    }

    .stat-subtitle {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .stat-breakdown {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border-subtle);
    }

    .breakdown-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: 500;
      
      mat-icon {
        font-size: 12px;
        width: 12px;
        height: 12px;
      }
      
      &.positive { color: var(--mat-sys-primary); }
      &.negative { color: var(--mat-sys-error); }
    }

    .positive { color: var(--mat-sys-primary); }
    .negative { color: var(--mat-sys-error); }

    .stat-net {
      font-size: 0.8rem;
      font-weight: 600;
      margin-top: 6px;
    }

    .stat-note {
      font-size: 0.7rem;
      color: var(--mat-sys-tertiary);
      margin-top: 2px;
    }

    .sync-button {
      margin-top: 8px;
      width: 100%;
      border-radius: 6px;
      height: 32px;
      font-size: 0.85rem;
      
      mat-icon, mat-spinner {
        margin-right: 4px;
      }
    }

    .net-worth-card { grid-column: span 1; }
    .spending-card { grid-column: span 1; }
    .inbox-card { grid-column: span 1; }
    .banks-card { grid-column: span 1; }
    
    .category-card {
      grid-column: span 2;
      grid-row: span 2;
    }
    
    .trends-card {
      grid-column: span 2;
      grid-row: span 2;
    }
    
    .accounts-card {
      grid-column: span 4;
    }

    mat-card-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-subtle);
      
      mat-card-title {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      
      mat-card-subtitle {
        font-size: 0.75rem;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 2px;
      }
    }

    mat-card-content {
      padding: 16px;
    }

    .no-data {
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      padding: 24px;
      font-size: 0.85rem;
    }

    .category-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .category-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .category-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .category-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .category-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface);
    }

    .category-amount {
      font-weight: 700;
      font-size: 0.95rem;
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface);
    }

    .category-count {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      text-align: right;
    }

    .category-bar {
      height: 4px;
      background: var(--bg-muted);
      border-radius: 2px;
      overflow: hidden;
    }

    .category-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--mat-sys-primary), var(--mat-sys-tertiary));
      border-radius: 3px;
      transition: width 0.4s ease;
    }

    .trends-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .trend-item {
      display: grid;
      grid-template-columns: 50px 1fr 70px;
      gap: 10px;
      align-items: center;
      padding: 6px 10px;
      background: var(--bg-subtle);
      border-radius: 6px;
      border: 1px solid var(--border-subtle);
    }

    .trend-month {
      font-weight: 600;
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface);
    }

    .trend-bars {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .trend-bar-row {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 14px;
    }

    .trend-bar {
      height: 10px;
      border-radius: 2px;
      min-width: 3px;
      transition: width 0.3s ease;
      
      &.income {
        background: var(--mat-sys-primary);
      }
      
      &.expenses {
        background: var(--mat-sys-error);
      }
    }

    .trend-value {
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }

    .trend-net {
      text-align: right;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      font-size: 0.8rem;
    }

    .trends-legend {
      display: flex;
      gap: 12px;
      margin-top: 10px;
      justify-content: center;
      padding-top: 10px;
      border-top: 1px solid var(--border-subtle);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .legend-color {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      
      &.income { background: var(--mat-sys-primary); }
      &.expenses { background: var(--mat-sys-error); }
    }

    .accounts-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 8px;
    }

    .account-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: var(--bg-subtle);
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      transition: all 0.2s ease;
      
      &:hover {
        background: var(--bg-muted);
        border-color: var(--border-default);
      }
    }

    .account-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
      flex: 1;
    }

    .account-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .account-institution {
      font-size: 0.7rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .account-balance {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      font-size: 0.9rem;
      flex-shrink: 0;
      margin-left: 10px;
    }

    @media (max-width: 1200px) {
      .dashboard-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .category-card, .trends-card {
        grid-column: span 1;
        grid-row: span 1;
      }
      
      .accounts-card {
        grid-column: span 2;
      }
    }

    @media (max-width: 768px) {
      .dashboard-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
      
      .stat-card {
        padding: 10px 12px;
      }
      
      .stat-header {
        margin-bottom: 4px;
        
        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
        
        span {
          font-size: 0.7rem;
        }
      }
      
      .stat-value {
        font-size: 1.25rem;
      }
      
      .stat-subtitle {
        font-size: 0.7rem;
      }
      
      .stat-breakdown {
        margin-top: 6px;
        padding-top: 6px;
        gap: 2px;
      }
      
      .breakdown-item {
        font-size: 0.7rem;
      }
      
      .stat-net {
        font-size: 0.75rem;
        margin-top: 4px;
      }
      
      .stat-note {
        font-size: 0.65rem;
      }
      
      .sync-button {
        margin-top: 6px;
        height: 28px;
        font-size: 0.75rem;
      }
      
      .category-card, .trends-card, .accounts-card {
        grid-column: span 2;
      }
      
      mat-card-header {
        padding: 10px 12px;
        
        mat-card-title {
          font-size: 0.85rem;
        }
        
        mat-card-subtitle {
          font-size: 0.7rem;
        }
      }
      
      mat-card-content {
        padding: 12px;
      }
      
      .category-list {
        gap: 10px;
      }
      
      .category-item {
        gap: 4px;
      }
      
      .category-name {
        font-size: 0.8rem;
      }
      
      .category-amount {
        font-size: 0.85rem;
      }
      
      .category-count {
        font-size: 0.7rem;
      }
      
      .trend-item {
        padding: 5px 8px;
        grid-template-columns: 45px 1fr 65px;
        gap: 8px;
      }
      
      .trend-month {
        font-size: 0.7rem;
      }
      
      .trend-value {
        font-size: 0.6rem;
      }
      
      .trend-net {
        font-size: 0.7rem;
      }
      
      .trends-legend {
        margin-top: 8px;
        padding-top: 8px;
        gap: 10px;
      }
      
      .legend-item {
        font-size: 0.7rem;
      }
      
      .accounts-list {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      
      .account-item {
        padding: 8px 10px;
      }
      
      .account-name {
        font-size: 0.8rem;
      }
      
      .account-institution {
        font-size: 0.65rem;
      }
      
      .account-balance {
        font-size: 0.85rem;
      }
    }
  `,
})
export class OverviewComponent implements OnInit {
  private readonly api = inject(FinanceApiService);

  dashboard = signal<DashboardSummary | null>(null);
  trends = signal<MonthlyTrend[]>([]);
  loading = signal(true);
  syncing = signal(false);

  maxTrendValue = signal(1);

  ngOnInit() {
    this.loadDashboard();
    this.loadTrends();
  }

  private loadDashboard() {
    this.loading.set(true);
    this.api.getDashboard().subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load dashboard', err);
        this.loading.set(false);
      },
    });
  }

  private loadTrends() {
    this.api.getMonthlyTrends(6).subscribe({
      next: (data) => {
        this.trends.set(data);
        const maxVal = Math.max(
          ...data.flatMap((t) => [t.income, t.expenses]),
          1
        );
        this.maxTrendValue.set(maxVal);
      },
      error: (err) => console.error('Failed to load trends', err),
    });
  }

  syncAll(event: Event) {
    event.stopPropagation();
    this.syncing.set(true);
    this.api.syncAllItems().subscribe({
      next: () => {
        this.syncing.set(false);
        this.loadDashboard();
        this.loadTrends();
      },
      error: (err) => {
        console.error('Sync failed', err);
        this.syncing.set(false);
      },
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  }

  formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  formatMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    });
  }

  getBarWidth(value: number, max: number): number {
    if (max === 0) return 0;
    return Math.max((value / max) * 100, 2);
  }

  formatCategoryName(category: string): string {
    if (!category) return 'Uncategorized';
    return category
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
