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
          <button mat-raised-button color="primary" routerLink="/dashboard/accounts">
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
              <div class="stat-value" [class.positive]="dashboard()!.netWorth.netWorth >= 0" [class.negative]="dashboard()!.netWorth.netWorth < 0">
                {{ formatCurrency(dashboard()!.netWorth.netWorth) }}
              </div>
              <div class="stat-breakdown">
                <span class="breakdown-item positive">
                  <mat-icon>arrow_upward</mat-icon>
                  Assets: {{ formatCurrency(dashboard()!.netWorth.totalAssets) }}
                </span>
                <span class="breakdown-item negative">
                  <mat-icon>arrow_downward</mat-icon>
                  Liabilities: {{ formatCurrency(dashboard()!.netWorth.totalLiabilities) }}
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
                Income: <span class="positive">{{ formatCurrency(dashboard()!.spending.totalIncome) }}</span>
              </div>
              <div class="stat-net">
                Net: 
                <span [class.positive]="dashboard()!.spending.netCashFlow >= 0" [class.negative]="dashboard()!.spending.netCashFlow < 0">
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
              <div class="stat-subtitle">
                transactions to review
              </div>
              @if (dashboard()!.pendingCount > 0) {
                <div class="stat-note">
                  {{ dashboard()!.pendingCount }} pending
                </div>
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
                @if (dashboard()!.lastSyncAt) {
                  Last synced {{ formatRelativeTime(dashboard()!.lastSyncAt!) }}
                } @else {
                  Never synced
                }
              </div>
              <button mat-stroked-button class="sync-button" (click)="syncAll($event)">
                @if (syncing()) {
                  <mat-spinner diameter="16"></mat-spinner>
                } @else {
                  <mat-icon>sync</mat-icon>
                }
                Sync Now
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
                  @for (cat of dashboard()!.spending.byCategory.slice(0, 8); track cat.category) {
                    <div class="category-item">
                      <div class="category-info">
                        <span class="category-name">{{ cat.category || 'Uncategorized' }}</span>
                        <span class="category-count">{{ cat.count }} transactions</span>
                      </div>
                      <div class="category-amount">{{ formatCurrency(cat.amount) }}</div>
                      <div class="category-bar">
                        <div class="category-bar-fill" [style.width.%]="cat.percentage"></div>
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
                        <div class="trend-bar income" [style.width.%]="getBarWidth(trend.income, maxTrendValue())">
                          <span class="trend-label">{{ formatCurrency(trend.income) }}</span>
                        </div>
                        <div class="trend-bar expenses" [style.width.%]="getBarWidth(trend.expenses, maxTrendValue())">
                          <span class="trend-label">{{ formatCurrency(trend.expenses) }}</span>
                        </div>
                      </div>
                      <div class="trend-net" [class.positive]="trend.netCashFlow >= 0" [class.negative]="trend.netCashFlow < 0">
                        {{ formatCurrency(trend.netCashFlow) }}
                      </div>
                    </div>
                  }
                </div>
                <div class="trends-legend">
                  <span class="legend-item"><span class="legend-color income"></span> Income</span>
                  <span class="legend-item"><span class="legend-color expenses"></span> Expenses</span>
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
                  @for (account of dashboard()!.netWorth.accountBreakdown; track account.accountId) {
                    <div class="account-item">
                      <div class="account-info">
                        <span class="account-name">{{ account.accountName }}</span>
                        <span class="account-institution">{{ account.institutionName || 'Unknown' }}</span>
                      </div>
                      <div class="account-balance" [class.positive]="account.isAsset" [class.negative]="!account.isAsset">
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
    .overview-container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      gap: 16px;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      text-align: center;
    }

    .empty-icon {
      font-size: 72px;
      width: 72px;
      height: 72px;
      color: var(--mat-sys-primary);
      margin-bottom: 16px;
    }

    .empty-state h2 {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface);
    }

    .empty-state p {
      margin: 0 0 24px;
      color: var(--mat-sys-on-surface-variant);
      max-width: 400px;
    }

    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    mat-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
    }

    .stat-card {
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .stat-card:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--mat-sys-primary);
      transform: translateY(-2px);
    }

    .stat-header {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.9rem;
      margin-bottom: 8px;
    }

    .stat-header mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      margin-bottom: 4px;
    }

    .stat-value.positive {
      color: var(--mat-sys-primary);
    }

    .stat-value.negative {
      color: var(--mat-sys-error);
    }

    .stat-subtitle {
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .stat-breakdown {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 12px;
      font-size: 0.85rem;
    }

    .breakdown-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .breakdown-item mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .breakdown-item.positive {
      color: var(--mat-sys-primary);
    }

    .breakdown-item.negative {
      color: var(--mat-sys-error);
    }

    .positive {
      color: var(--mat-sys-primary);
    }

    .negative {
      color: var(--mat-sys-error);
    }

    .stat-net {
      font-size: 0.9rem;
      margin-top: 8px;
      font-weight: 500;
    }

    .stat-note {
      font-size: 0.8rem;
      color: var(--mat-sys-tertiary);
      margin-top: 4px;
    }

    .sync-button {
      margin-top: 12px;
      width: 100%;
    }

    .sync-button mat-icon, .sync-button mat-spinner {
      margin-right: 4px;
    }

    .net-worth-card {
      grid-column: span 1;
    }

    .spending-card {
      grid-column: span 1;
    }

    .inbox-card {
      grid-column: span 1;
    }

    .banks-card {
      grid-column: span 1;
    }

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
      padding-bottom: 16px;
    }

    .no-data {
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      padding: 24px;
    }

    .category-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .category-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .category-info {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .category-name {
      font-weight: 500;
    }

    .category-count {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .category-amount {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .category-bar {
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }

    .category-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--mat-sys-primary), var(--mat-sys-tertiary));
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .trends-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .trend-item {
      display: grid;
      grid-template-columns: 80px 1fr 100px;
      gap: 12px;
      align-items: center;
    }

    .trend-month {
      font-weight: 500;
      font-size: 0.9rem;
    }

    .trend-bars {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .trend-bar {
      height: 16px;
      border-radius: 4px;
      min-width: 2px;
      display: flex;
      align-items: center;
      padding: 0 8px;
      transition: width 0.3s ease;
    }

    .trend-bar.income {
      background: var(--mat-sys-primary);
    }

    .trend-bar.expenses {
      background: var(--mat-sys-error);
    }

    .trend-label {
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .trend-net {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .trends-legend {
      display: flex;
      gap: 16px;
      margin-top: 16px;
      justify-content: center;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 3px;
    }

    .legend-color.income {
      background: var(--mat-sys-primary);
    }

    .legend-color.expenses {
      background: var(--mat-sys-error);
    }

    .accounts-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }

    .account-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .account-info {
      display: flex;
      flex-direction: column;
    }

    .account-name {
      font-weight: 500;
    }

    .account-institution {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .account-balance {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
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
      }

      .category-card, .trends-card, .accounts-card {
        grid-column: span 1;
      }

      .trend-item {
        grid-template-columns: 60px 1fr 80px;
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
        const maxVal = Math.max(...data.flatMap(t => [t.income, t.expenses]), 1);
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
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }

  getBarWidth(value: number, max: number): number {
    if (max === 0) return 0;
    return Math.max((value / max) * 100, 2);
  }
}
