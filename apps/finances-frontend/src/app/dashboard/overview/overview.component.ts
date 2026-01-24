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
                <div class="category-info">
                  <span class="category-name">{{
                    cat.category || 'Uncategorized'
                  }}</span>
                  <span class="category-count"
                    >{{ cat.count }} transactions</span
                  >
                </div>
                <div class="category-amount">
                  {{ formatCurrency(cat.amount) }}
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
                  <div
                    class="trend-bar income"
                    [style.width.%]="getBarWidth(trend.income, maxTrendValue())"
                  >
                    <span class="trend-label">{{
                      formatCurrency(trend.income)
                    }}</span>
                  </div>
                  <div
                    class="trend-bar expenses"
                    [style.width.%]="
                      getBarWidth(trend.expenses, maxTrendValue())
                    "
                  >
                    <span class="trend-label">{{
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
      gap: 20px;
    }

    mat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 20px;
      overflow: hidden;
    }

    .stat-card {
      padding: 24px;
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
      
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(var(--mat-sys-primary-rgb), 0.3), transparent);
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      
      &:hover {
        background: var(--bg-card-hover);
        border-color: rgba(var(--mat-sys-primary-rgb), 0.3);
        transform: translateY(-4px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        
        &::before {
          opacity: 1;
        }
      }
    }

    .stat-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      
      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: var(--mat-sys-primary);
      }
      
      span {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
        letter-spacing: 0.01em;
      }
    }

    .stat-value {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
      margin-bottom: 4px;
      
      &.positive { color: var(--mat-sys-primary); }
      &.negative { color: var(--mat-sys-error); }
    }

    .stat-subtitle {
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .stat-breakdown {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
    }

    .breakdown-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      
      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      
      &.positive { color: var(--mat-sys-primary); }
      &.negative { color: var(--mat-sys-error); }
    }

    .positive { color: var(--mat-sys-primary); }
    .negative { color: var(--mat-sys-error); }

    .stat-net {
      font-size: 0.9rem;
      font-weight: 600;
      margin-top: 12px;
    }

    .stat-note {
      font-size: 0.8rem;
      color: var(--mat-sys-tertiary);
      margin-top: 6px;
    }

    .sync-button {
      margin-top: 16px;
      width: 100%;
      border-radius: 12px;
      height: 40px;
      
      mat-icon, mat-spinner {
        margin-right: 6px;
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
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-subtle);
      
      mat-card-title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      
      mat-card-subtitle {
        font-size: 0.8rem;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 2px;
      }
    }

    mat-card-content {
      padding: 24px;
    }

    .no-data {
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      padding: 32px;
      font-size: 0.9rem;
    }

    .category-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .category-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .category-info {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .category-name {
      font-weight: 600;
      font-size: 0.95rem;
    }

    .category-count {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .category-amount {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface);
    }

    .category-bar {
      height: 8px;
      background: var(--bg-muted);
      border-radius: 4px;
      overflow: hidden;
    }

    .category-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--mat-sys-primary), var(--mat-sys-tertiary));
      border-radius: 4px;
      transition: width 0.4s ease;
    }

    .trends-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .trend-item {
      display: grid;
      grid-template-columns: 80px 1fr 100px;
      gap: 16px;
      align-items: center;
    }

    .trend-month {
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--mat-sys-on-surface);
    }

    .trend-bars {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .trend-bar {
      height: 20px;
      border-radius: 6px;
      min-width: 4px;
      display: flex;
      align-items: center;
      padding: 0 10px;
      transition: width 0.4s ease;
      
      &.income {
        background: linear-gradient(90deg, var(--mat-sys-primary), rgba(var(--mat-sys-primary-rgb), 0.7));
      }
      
      &.expenses {
        background: linear-gradient(90deg, var(--mat-sys-error), rgba(var(--mat-sys-error-rgb), 0.7));
      }
    }

    .trend-label {
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .trend-net {
      text-align: right;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .trends-legend {
      display: flex;
      gap: 24px;
      margin-top: 20px;
      justify-content: center;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .legend-color {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      
      &.income { background: var(--mat-sys-primary); }
      &.expenses { background: var(--mat-sys-error); }
    }

    .accounts-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .account-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: var(--bg-subtle);
      border-radius: 12px;
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
      gap: 2px;
    }

    .account-name {
      font-weight: 600;
      font-size: 0.95rem;
    }

    .account-institution {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .account-balance {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      font-size: 1.05rem;
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
        grid-template-columns: 1fr;
        gap: 16px;
      }
      
      .category-card, .trends-card, .accounts-card {
        grid-column: span 1;
      }
      
      .trend-item {
        grid-template-columns: 60px 1fr 80px;
        gap: 12px;
      }
      
      .stat-value {
        font-size: 1.75rem;
      }
      
      .accounts-list {
        grid-template-columns: 1fr;
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
}
