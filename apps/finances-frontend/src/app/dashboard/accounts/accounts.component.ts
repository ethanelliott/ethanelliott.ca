import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRippleModule } from '@angular/material/core';
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
    MatMenuModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatRippleModule,
  ],
  styleUrl: './accounts.component.scss',
  template: `
    <div class="accounts-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <p class="page-subtitle">Connect and manage your bank accounts</p>
        </div>
        <div class="header-right">
          @if (accountSummary()) {
          <div class="net-worth-display">
            <span class="net-worth-label">Net Worth</span>
            <span
              class="net-worth-value"
              [class.positive]="accountSummary()!.totalBalance >= 0"
              [class.negative]="accountSummary()!.totalBalance < 0"
            >
              {{ formatCurrency(accountSummary()!.totalBalance) }}
            </span>
          </div>
          }
          <button
            mat-flat-button
            color="primary"
            (click)="connectBank()"
            [disabled]="connecting()"
            class="connect-btn"
          >
            @if (connecting()) {
            <mat-spinner diameter="18"></mat-spinner>
            } @else {
            <mat-icon>add_link</mat-icon>
            }
            <span>Connect Bank</span>
          </button>
        </div>
      </div>

      @if (loading()) {
      <div class="loading-state">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Loading your accounts...</p>
      </div>
      } @else if (accountsByInstitution().length === 0) {
      <div class="empty-state">
        <div class="empty-icon">
          <mat-icon>account_balance</mat-icon>
        </div>
        <h3>No banks connected</h3>
        <p>Connect your first bank to start tracking your finances</p>
        <button
          mat-flat-button
          color="primary"
          (click)="connectBank()"
          [disabled]="connecting()"
        >
          @if (connecting()) {
          <mat-spinner diameter="18"></mat-spinner>
          } @else {
          <mat-icon>add_link</mat-icon>
          }
          <span>Connect Your First Bank</span>
        </button>
      </div>
      } @else {
      <!-- Banks List -->
      <div class="banks-list">
        @for (institution of accountsByInstitution(); track
        institution.institutionId) {
        <div
          class="bank-card"
          [class.expanded]="
            expandedInstitution() ===
            (institution.institutionId || institution.institutionName)
          "
        >
          <!-- Bank Header (clickable) -->
          <div
            class="bank-header"
            matRipple
            (click)="
              toggleInstitution(
                institution.institutionId || institution.institutionName
              )
            "
          >
            <div class="bank-info">
              @if (institution.institutionLogo) {
              <img
                [src]="'data:image/png;base64,' + institution.institutionLogo"
                class="bank-logo"
                alt=""
              />
              } @else {
              <div
                class="bank-logo-placeholder"
                [style.background]="institution.institutionColor || '#666'"
              >
                <mat-icon>account_balance</mat-icon>
              </div>
              }
              <div class="bank-details">
                <span class="bank-name">{{ institution.institutionName }}</span>
                <span class="bank-meta">
                  {{ institution.accounts.length }}
                  {{
                    institution.accounts.length === 1 ? 'account' : 'accounts'
                  }}
                  · {{ getSyncStatus(institution) }}
                </span>
              </div>
            </div>
            <div class="bank-right">
              <span
                class="bank-balance"
                [class.positive]="getInstitutionNetBalance(institution) >= 0"
                [class.negative]="getInstitutionNetBalance(institution) < 0"
              >
                {{ formatCurrency(getInstitutionNetBalance(institution)) }}
              </span>
              <mat-icon class="expand-icon">
                {{
                  expandedInstitution() ===
                  (institution.institutionId || institution.institutionName)
                    ? 'expand_less'
                    : 'expand_more'
                }}
              </mat-icon>
              <button
                mat-icon-button
                [matMenuTriggerFor]="bankMenu"
                (click)="$event.stopPropagation()"
                class="bank-menu-btn"
              >
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #bankMenu="matMenu">
                <button mat-menu-item (click)="syncInstitution(institution)">
                  <mat-icon>sync</mat-icon>
                  <span>Sync Now</span>
                </button>
                <button mat-menu-item (click)="updateConnection(institution)">
                  <mat-icon>refresh</mat-icon>
                  <span>Update Connection</span>
                </button>
                <button
                  mat-menu-item
                  (click)="disconnectInstitution(institution)"
                  class="danger-item"
                >
                  <mat-icon>link_off</mat-icon>
                  <span>Disconnect</span>
                </button>
              </mat-menu>
            </div>
          </div>

          <!-- Accounts List (expandable) -->
          @if (expandedInstitution() === (institution.institutionId ||
          institution.institutionName)) {
          <div class="accounts-list">
            @for (account of institution.accounts; track account.id) {
            <div
              class="account-row"
              matRipple
              [class.hidden-account]="!account.isVisible"
              (click)="viewAccountDetails(account)"
            >
              <div class="account-icon" [class]="account.type">
                <mat-icon>{{ getAccountIcon(account.type) }}</mat-icon>
              </div>
              <div class="account-info">
                <span class="account-name">{{ account.name }}</span>
                <span class="account-meta">
                  {{ account.subtype || account.type | titlecase }}
                  @if (account.mask) { · •••• {{ account.mask }} }
                </span>
              </div>
              <div class="account-right">
                <div class="account-balance-info">
                  <span
                    class="account-balance"
                    [class.positive]="isAssetAccount(account)"
                    [class.negative]="!isAssetAccount(account)"
                  >
                    {{ formatCurrency(account.currentBalance ?? 0) }}
                  </span>
                  @if (account.availableBalance !== null &&
                  account.availableBalance !== account.currentBalance) {
                  <span class="account-available">
                    {{ formatCurrency(account.availableBalance) }} available
                  </span>
                  }
                </div>
                <mat-slide-toggle
                  [checked]="account.isVisible"
                  (change)="toggleAccountVisibility(account, $event)"
                  (click)="$event.stopPropagation()"
                  matTooltip="Include in totals"
                  class="visibility-toggle"
                ></mat-slide-toggle>
                <mat-icon class="chevron-icon">chevron_right</mat-icon>
              </div>
            </div>
            }
          </div>
          }
        </div>
        }
      </div>
      }

      <!-- Account Detail Panel -->
      @if (selectedAccount()) {
      <div class="account-detail-overlay" (click)="closeAccountDetails()"></div>
      <div class="account-detail-panel">
        <div class="detail-header">
          <button mat-icon-button (click)="closeAccountDetails()">
            <mat-icon>close</mat-icon>
          </button>
          <div class="detail-title">
            <div class="detail-icon" [class]="selectedAccount()!.type">
              <mat-icon>{{ getAccountIcon(selectedAccount()!.type) }}</mat-icon>
            </div>
            <div class="detail-info">
              <h2>{{ selectedAccount()!.name }}</h2>
              <span class="detail-meta">
                {{
                  selectedAccount()!.subtype || selectedAccount()!.type
                    | titlecase
                }}
                @if (selectedAccount()!.mask) { · ••••
                {{ selectedAccount()!.mask }} }
              </span>
            </div>
          </div>
          <span
            class="detail-balance"
            [class.positive]="isAssetAccount(selectedAccount()!)"
            [class.negative]="!isAssetAccount(selectedAccount()!)"
          >
            {{ formatCurrency(selectedAccount()!.currentBalance ?? 0) }}
          </span>
        </div>

        <div class="detail-content">
          <div class="detail-stats">
            <div class="stat-item">
              <span class="stat-label">Current Balance</span>
              <span class="stat-value">
                {{ formatCurrency(selectedAccount()!.currentBalance ?? 0) }}
              </span>
            </div>
            @if (selectedAccount()!.availableBalance !== null) {
            <div class="stat-item">
              <span class="stat-label">Available Balance</span>
              <span class="stat-value">
                {{ formatCurrency(selectedAccount()!.availableBalance!) }}
              </span>
            </div>
            } @if (selectedAccount()!.limitAmount) {
            <div class="stat-item">
              <span class="stat-label">Credit Limit</span>
              <span class="stat-value">
                {{ formatCurrency(selectedAccount()!.limitAmount!) }}
              </span>
            </div>
            }
          </div>

          <div class="detail-actions">
            <button
              mat-flat-button
              color="primary"
              (click)="viewTransactions(selectedAccount()!)"
            >
              <mat-icon>receipt_long</mat-icon>
              View Transactions
            </button>
          </div>
        </div>
      </div>
      }
    </div>
  `,
})
export class AccountsComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);
  private readonly router = inject(Router);

  loading = signal(true);
  connecting = signal(false);
  plaidItems = signal<PlaidItem[]>([]);
  accountsByInstitution = signal<AccountsByInstitution[]>([]);
  accountSummary = signal<AccountSummary | null>(null);
  expandedInstitution = signal<string | null>(null);
  selectedAccount = signal<Account | null>(null);

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

      // Auto-expand first institution if only one
      if (accounts.length === 1) {
        this.expandedInstitution.set(accounts[0].institutionId);
      }
    } catch (error) {
      this.snackBar.open('Failed to load accounts', 'Close', {
        duration: 3000,
      });
      console.error('Error loading accounts:', error);
    } finally {
      this.loading.set(false);
    }
  }

  toggleInstitution(institutionId: string | null) {
    const id = institutionId || '';
    if (this.expandedInstitution() === id) {
      this.expandedInstitution.set(null);
    } else {
      this.expandedInstitution.set(id);
    }
  }

  viewAccountDetails(account: Account) {
    this.selectedAccount.set(account);
  }

  closeAccountDetails() {
    this.selectedAccount.set(null);
  }

  viewTransactions(account: Account) {
    this.closeAccountDetails();
    this.router.navigate(['/dashboard/transactions'], {
      queryParams: { accountId: account.id },
    });
  }

  getSyncStatus(institution: AccountsByInstitution): string {
    const item = this.plaidItems().find(
      (i) =>
        i.institutionId === institution.institutionId ||
        i.institutionName === institution.institutionName
    );
    if (!item) return 'Unknown';
    if (item.lastSyncAt) {
      return `Synced ${this.formatRelativeTime(item.lastSyncAt)}`;
    }
    return 'Never synced';
  }

  async connectBank() {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      this.connecting.set(true);
      const { linkToken } = await firstValueFrom(
        this.apiService.createLinkToken()
      );

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
            this.snackBar.open('Bank connected successfully!', 'Close', {
              duration: 3000,
            });
            this.loadData();
          } catch (error) {
            console.error('Failed to exchange token:', error);
            this.snackBar.open('Failed to connect bank', 'Close', {
              duration: 3000,
            });
          } finally {
            this.connecting.set(false);
          }
        },
        onExit: (err: any) => {
          this.connecting.set(false);
          if (err) {
            console.error('Plaid Link error:', err);
            this.snackBar.open('Connection cancelled', 'Close', {
              duration: 3000,
            });
          }
        },
        onEvent: (eventName: string, metadata: any) => {
          console.log('Plaid event:', eventName, metadata);
        },
      });

      this.plaidHandler.open();
    } catch (error) {
      console.error('Failed to create link token:', error);
      this.snackBar.open('Failed to initiate bank connection', 'Close', {
        duration: 3000,
      });
      this.connecting.set(false);
    }
  }

  async updateConnection(institution: AccountsByInstitution) {
    if (!isPlatformBrowser(this.platformId)) return;

    const item = this.plaidItems().find(
      (i) =>
        i.institutionId === institution.institutionId ||
        i.institutionName === institution.institutionName
    );

    if (!item) {
      this.snackBar.open('Could not find connection to update', 'Close', {
        duration: 3000,
      });
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
          this.snackBar.open('Connection updated successfully!', 'Close', {
            duration: 3000,
          });
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
      this.snackBar.open('Failed to update connection', 'Close', {
        duration: 3000,
      });
    }
  }

  async syncInstitution(institution: AccountsByInstitution) {
    const item = this.plaidItems().find(
      (i) =>
        i.institutionId === institution.institutionId ||
        i.institutionName === institution.institutionName
    );

    if (!item) {
      this.snackBar.open('Could not find connection to sync', 'Close', {
        duration: 3000,
      });
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
      (i) =>
        i.institutionId === institution.institutionId ||
        i.institutionName === institution.institutionName
    );

    if (!item) {
      this.snackBar.open('Could not find connection to disconnect', 'Close', {
        duration: 3000,
      });
      return;
    }

    try {
      await firstValueFrom(this.apiService.removePlaidItem(item.id));
      this.snackBar.open('Bank disconnected successfully', 'Close', {
        duration: 3000,
      });
      this.loadData();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      this.snackBar.open('Failed to disconnect bank', 'Close', {
        duration: 3000,
      });
    }
  }

  async toggleAccountVisibility(account: Account, event: any) {
    try {
      await firstValueFrom(
        this.apiService.updateAccountVisibility(account.id, event.checked)
      );
      this.loadData();
    } catch (error) {
      console.error('Failed to update visibility:', error);
      this.snackBar.open('Failed to update account visibility', 'Close', {
        duration: 3000,
      });
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

  getInstitutionNetBalance(institution: AccountsByInstitution): number {
    return institution.accounts.reduce((total, account) => {
      const balance = account.currentBalance ?? 0;
      // Asset accounts add to net worth, liability accounts subtract
      if (this.isAssetAccount(account)) {
        return total + balance;
      } else {
        // Credit/loan balances are typically positive but represent debt
        return total - Math.abs(balance);
      }
    }, 0);
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
