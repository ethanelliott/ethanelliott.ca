import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  FinanceApiService,
  Account,
  AccountsByInstitution,
  AccountSummary,
  PlaidItem,
  PlaidItemStatus,
} from '../../services/finance-api.service';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';

declare global {
  interface Window {
    Plaid: {
      create: (config: any) => {
        open: () => void;
        destroy: () => void;
      };
    };
  }
}

@Component({
  selector: 'app-accounts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatChipsModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  styleUrl: './accounts.component.scss',
  template: `
    <div class="accounts-container">
      <!-- Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <p class="page-subtitle">
              Connect and manage your bank accounts
            </p>
          </div>
          <div class="controls-section">
            <div class="header-stats">
              @if (accountSummary()) {
                <div class="stat-chip">
                  <mat-icon>account_balance</mat-icon>
                  <span>{{ accountSummary()!.visibleAccounts }} Accounts</span>
                </div>
                <div class="stat-chip">
                  <mat-icon>payments</mat-icon>
                  <span>{{ formatCurrency(accountSummary()!.totalBalance) }}</span>
                </div>
              }
            </div>
            <button
              mat-raised-button
              color="primary"
              (click)="connectBank()"
              [disabled]="connecting()"
              class="add-button"
            >
              @if (connecting()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <mat-icon>add_link</mat-icon>
              }
              Connect Bank
            </button>
          </div>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner></mat-spinner>
          <h3>Loading Accounts</h3>
          <p>Fetching your connected bank accounts...</p>
        </div>
      } @else if (plaidItems().length === 0) {
        <mat-card class="empty-state-card">
          <mat-card-content>
            <div class="empty-state">
              <mat-icon>account_balance</mat-icon>
              <h3>No Bank Accounts Connected</h3>
              <p>Connect your first bank account to start tracking your finances automatically</p>
              <button
                mat-raised-button
                color="primary"
                (click)="connectBank()"
                [disabled]="connecting()"
                class="get-started-button"
              >
                @if (connecting()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <mat-icon>add_link</mat-icon>
                }
                Connect Your First Bank
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      } @else {
        <!-- Summary Cards -->
        @if (accountSummary()) {
          <div class="summary-grid">
            <mat-card class="summary-card">
              <mat-card-header>
                <div class="summary-icon assets">
                  <mat-icon>trending_up</mat-icon>
                </div>
                <div class="summary-info">
                  <mat-card-title>Total Assets</mat-card-title>
                  <mat-card-subtitle>Cash & Investments</mat-card-subtitle>
                </div>
              </mat-card-header>
              <mat-card-content>
                <div class="summary-value positive">
                  {{ formatCurrency(getTotalAssets()) }}
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card class="summary-card">
              <mat-card-header>
                <div class="summary-icon liabilities">
                  <mat-icon>trending_down</mat-icon>
                </div>
                <div class="summary-info">
                  <mat-card-title>Total Liabilities</mat-card-title>
                  <mat-card-subtitle>Credit & Loans</mat-card-subtitle>
                </div>
              </mat-card-header>
              <mat-card-content>
                <div class="summary-value negative">
                  {{ formatCurrency(getTotalLiabilities()) }}
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card class="summary-card">
              <mat-card-header>
                <div class="summary-icon net-worth">
                  <mat-icon>account_balance_wallet</mat-icon>
                </div>
                <div class="summary-info">
                  <mat-card-title>Net Worth</mat-card-title>
                  <mat-card-subtitle>Assets - Liabilities</mat-card-subtitle>
                </div>
              </mat-card-header>
              <mat-card-content>
                <div class="summary-value" [class.positive]="accountSummary()!.totalBalance >= 0" [class.negative]="accountSummary()!.totalBalance < 0">
                  {{ formatCurrency(accountSummary()!.totalBalance) }}
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        }

        <!-- Institutions and Accounts -->
        <div class="institutions-grid">
          @for (institution of accountsByInstitution(); track institution.institutionId) {
            <mat-card class="institution-card">
              <mat-card-header>
                <div class="institution-header">
                  <div class="institution-info">
                    @if (institution.institutionLogo) {
                      <img [src]="'data:image/png;base64,' + institution.institutionLogo" class="institution-logo" alt="">
                    } @else {
                      <div class="institution-logo-placeholder" [style.background]="institution.institutionColor || '#666'">
                        <mat-icon>account_balance</mat-icon>
                      </div>
                    }
                    <div class="institution-details">
                      <mat-card-title>{{ institution.institutionName }}</mat-card-title>
                      <mat-card-subtitle>{{ institution.accounts.length }} account(s)</mat-card-subtitle>
                    </div>
                  </div>
                  <div class="institution-actions">
                    <div class="institution-total">
                      {{ formatCurrency(institution.totalBalance) }}
                    </div>
                    <button mat-icon-button [matMenuTriggerFor]="institutionMenu">
                      <mat-icon>more_vert</mat-icon>
                    </button>
                    <mat-menu #institutionMenu="matMenu">
                      <button mat-menu-item (click)="syncInstitution(institution)">
                        <mat-icon>sync</mat-icon>
                        <span>Sync Now</span>
                      </button>
                      <button mat-menu-item (click)="updateConnection(institution)">
                        <mat-icon>refresh</mat-icon>
                        <span>Update Connection</span>
                      </button>
                      <button mat-menu-item (click)="disconnectInstitution(institution)" class="danger-item">
                        <mat-icon>link_off</mat-icon>
                        <span>Disconnect</span>
                      </button>
                    </mat-menu>
                  </div>
                </div>
              </mat-card-header>

              <mat-card-content>
                <div class="accounts-list">
                  @for (account of institution.accounts; track account.id) {
                    <div class="account-item" [class.hidden]="!account.isVisible">
                      <div class="account-info">
                        <div class="account-icon" [class]="account.type">
                          <mat-icon>{{ getAccountIcon(account.type) }}</mat-icon>
                        </div>
                        <div class="account-details">
                          <span class="account-name">{{ account.name }}</span>
                          <span class="account-type">
                            {{ account.subtype || account.type }}
                            @if (account.mask) {
                              •••• {{ account.mask }}
                            }
                          </span>
                        </div>
                      </div>
                      <div class="account-balance-section">
                        <div class="account-balance" [class.positive]="isAssetAccount(account)" [class.negative]="!isAssetAccount(account)">
                          {{ formatCurrency(account.currentBalance ?? 0) }}
                        </div>
                        @if (account.availableBalance !== null && account.availableBalance !== account.currentBalance) {
                          <div class="account-available">
                            Available: {{ formatCurrency(account.availableBalance) }}
                          </div>
                        }
                      </div>
                      <div class="account-toggle">
                        <mat-slide-toggle
                          [checked]="account.isVisible"
                          (change)="toggleAccountVisibility(account)"
                          matTooltip="Show/hide this account"
                        ></mat-slide-toggle>
                      </div>
                    </div>
                  }
                </div>
              </mat-card-content>
            </mat-card>
          }
        </div>

        <!-- Sync Status -->
        <mat-card class="sync-status-card">
          <mat-card-header>
            <mat-card-title>Sync History</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="sync-info">
              @for (item of plaidItems(); track item.id) {
                <div class="sync-item">
                  <div class="sync-item-info">
                    <span class="sync-institution">{{ item.institutionName || 'Unknown' }}</span>
                    <span class="sync-status" [class]="getStatusClass(item.status)">
                      {{ item.status }}
                    </span>
                  </div>
                  <div class="sync-time">
                    @if (item.lastSyncAt) {
                      Last synced {{ formatRelativeTime(item.lastSyncAt) }}
                    } @else {
                      Never synced
                    }
                  </div>
                  @if (item.lastError) {
                    <div class="sync-error">{{ item.lastError }}</div>
                  }
                </div>
              }
            </div>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
})
export class AccountsComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);

  loading = signal(true);
  connecting = signal(false);
  plaidItems = signal<PlaidItem[]>([]);
  accountsByInstitution = signal<AccountsByInstitution[]>([]);
  accountSummary = signal<AccountSummary | null>(null);

  private plaidHandler: any = null;

  ngOnInit() {
    this.loadPlaidScript();
    this.loadData();
  }

  private loadPlaidScript() {
    if (!isPlatformBrowser(this.platformId)) return;
    
    if (document.getElementById('plaid-link-script')) return;

    const script = document.createElement('script');
    script.id = 'plaid-link-script';
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    document.head.appendChild(script);
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const [items, accounts, summary] = await Promise.all([
        firstValueFrom(this.apiService.getPlaidItems()),
        firstValueFrom(this.apiService.getAccountsByInstitution()),
        firstValueFrom(this.apiService.getAccountSummary()),
      ]);
      this.plaidItems.set(items);
      this.accountsByInstitution.set(accounts);
      this.accountSummary.set(summary);
    } catch (error) {
      this.snackBar.open('Failed to load accounts', 'Close', { duration: 3000 });
      console.error('Error loading accounts:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async connectBank() {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      this.connecting.set(true);
      const { linkToken } = await firstValueFrom(this.apiService.createLinkToken());

      if (!window.Plaid) {
        throw new Error('Plaid SDK not loaded');
      }

      this.plaidHandler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken: string, metadata: any) => {
          try {
            await firstValueFrom(
              this.apiService.exchangeToken(
                publicToken,
                metadata.institution?.institution_id,
                metadata.institution?.name
              )
            );
            this.snackBar.open('Bank connected successfully!', 'Close', { duration: 3000 });
            this.loadData();
          } catch (error) {
            console.error('Failed to exchange token:', error);
            this.snackBar.open('Failed to connect bank', 'Close', { duration: 3000 });
          } finally {
            this.connecting.set(false);
          }
        },
        onExit: (err: any, metadata: any) => {
          this.connecting.set(false);
          if (err) {
            console.error('Plaid Link error:', err);
            this.snackBar.open('Connection cancelled', 'Close', { duration: 3000 });
          }
        },
        onEvent: (eventName: string, metadata: any) => {
          console.log('Plaid event:', eventName, metadata);
        },
      });

      this.plaidHandler.open();
    } catch (error) {
      console.error('Failed to create link token:', error);
      this.snackBar.open('Failed to initiate bank connection', 'Close', { duration: 3000 });
      this.connecting.set(false);
    }
  }

  async updateConnection(institution: AccountsByInstitution) {
    if (!isPlatformBrowser(this.platformId)) return;

    const item = this.plaidItems().find(
      i => i.institutionId === institution.institutionId || i.institutionName === institution.institutionName
    );

    if (!item) {
      this.snackBar.open('Could not find connection to update', 'Close', { duration: 3000 });
      return;
    }

    try {
      const { linkToken } = await firstValueFrom(
        this.apiService.createUpdateLinkToken(item.id)
      );

      if (!window.Plaid) {
        throw new Error('Plaid SDK not loaded');
      }

      this.plaidHandler = window.Plaid.create({
        token: linkToken,
        onSuccess: async () => {
          this.snackBar.open('Connection updated successfully!', 'Close', { duration: 3000 });
          this.loadData();
        },
        onExit: (err: any) => {
          if (err) {
            console.error('Plaid Link error:', err);
          }
        },
      });

      this.plaidHandler.open();
    } catch (error) {
      console.error('Failed to update connection:', error);
      this.snackBar.open('Failed to update connection', 'Close', { duration: 3000 });
    }
  }

  async syncInstitution(institution: AccountsByInstitution) {
    const item = this.plaidItems().find(
      i => i.institutionId === institution.institutionId || i.institutionName === institution.institutionName
    );

    if (!item) {
      this.snackBar.open('Could not find connection to sync', 'Close', { duration: 3000 });
      return;
    }

    try {
      const result = await firstValueFrom(this.apiService.syncItem(item.id));
      this.snackBar.open(
        `Synced: ${result.added} added, ${result.modified} modified, ${result.removed} removed`,
        'Close',
        { duration: 5000 }
      );
      this.loadData();
    } catch (error) {
      console.error('Failed to sync:', error);
      this.snackBar.open('Failed to sync', 'Close', { duration: 3000 });
    }
  }

  async disconnectInstitution(institution: AccountsByInstitution) {
    const confirmed = await firstValueFrom(
      this.dialogService.confirm(
        `Are you sure you want to disconnect "${institution.institutionName}"? All associated accounts and transaction history will be removed.`,
        'Disconnect Bank',
        'Disconnect',
        'Cancel'
      )
    );

    if (!confirmed) return;

    const item = this.plaidItems().find(
      i => i.institutionId === institution.institutionId || i.institutionName === institution.institutionName
    );

    if (!item) {
      this.snackBar.open('Could not find connection to disconnect', 'Close', { duration: 3000 });
      return;
    }

    try {
      await firstValueFrom(this.apiService.removePlaidItem(item.id));
      this.snackBar.open('Bank disconnected successfully', 'Close', { duration: 3000 });
      this.loadData();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      this.snackBar.open('Failed to disconnect bank', 'Close', { duration: 3000 });
    }
  }

  async toggleAccountVisibility(account: Account) {
    try {
      await firstValueFrom(
        this.apiService.updateAccountVisibility(account.id, !account.isVisible)
      );
      this.loadData();
    } catch (error) {
      console.error('Failed to update visibility:', error);
      this.snackBar.open('Failed to update account visibility', 'Close', { duration: 3000 });
    }
  }

  getAccountIcon(type: string): string {
    switch (type) {
      case 'depository':
        return 'account_balance';
      case 'credit':
        return 'credit_card';
      case 'loan':
        return 'request_quote';
      case 'investment':
      case 'brokerage':
        return 'trending_up';
      default:
        return 'account_balance_wallet';
    }
  }

  isAssetAccount(account: Account): boolean {
    return ['depository', 'investment', 'brokerage'].includes(account.type);
  }

  getTotalAssets(): number {
    const summary = this.accountSummary();
    if (!summary) return 0;
    
    let total = 0;
    for (const [type, data] of Object.entries(summary.byType)) {
      if (['depository', 'investment', 'brokerage'].includes(type)) {
        total += data.balance;
      }
    }
    return total;
  }

  getTotalLiabilities(): number {
    const summary = this.accountSummary();
    if (!summary) return 0;
    
    let total = 0;
    for (const [type, data] of Object.entries(summary.byType)) {
      if (['credit', 'loan'].includes(type)) {
        total += Math.abs(data.balance);
      }
    }
    return total;
  }

  getStatusClass(status: PlaidItemStatus): string {
    switch (status) {
      case PlaidItemStatus.ACTIVE:
        return 'status-active';
      case PlaidItemStatus.ERROR:
        return 'status-error';
      case PlaidItemStatus.PENDING_EXPIRATION:
        return 'status-warning';
      case PlaidItemStatus.REVOKED:
        return 'status-error';
      default:
        return '';
    }
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
}
