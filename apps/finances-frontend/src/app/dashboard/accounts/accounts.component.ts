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
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import {
  FinanceApiService,
  Account,
  AccountSummary,
} from '../../services/finance-api.service';
import { DialogService } from '../../shared/dialogs';
import { AccountDialogComponent } from './account-dialog.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-accounts',
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
  ],
  styleUrl: './accounts.component.scss',
  template: `
    <div class="accounts-container">
      <!-- Modern Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <h1 class="page-title">
              <mat-icon>account_balance_wallet</mat-icon>
              Accounts
            </h1>
            <p class="page-subtitle">
              Manage your financial accounts and track balances
            </p>
          </div>
          <div class="controls-section">
            <div class="header-stats">
              <div class="stat-chip">
                <mat-icon>list</mat-icon>
                <span>{{ accounts().length }} Accounts</span>
              </div>
              @if (accountSummary()) {
              <div class="stat-chip">
                <mat-icon>account_balance</mat-icon>
                <span>{{
                  formatCurrency(accountSummary()!.totalBalance)
                }}</span>
              </div>
              }
            </div>
            <button
              mat-raised-button
              color="primary"
              (click)="openAccountDialog()"
              class="add-button"
            >
              <mat-icon>add</mat-icon>
              Add Account
            </button>
          </div>
        </div>
      </div>

      @if (loading()) {
      <div class="loading-container">
        <mat-spinner></mat-spinner>
        <h3>Loading Accounts</h3>
        <p>Setting up your account management...</p>
      </div>
      } @else {

      <!-- Summary Cards -->
      @if (accountSummary()) {
      <div class="summary-grid">
        <mat-card class="summary-card total-balance">
          <mat-card-header>
            <div class="summary-icon">
              <mat-icon>account_balance</mat-icon>
            </div>
            <div class="summary-info">
              <mat-card-title>Total Balance</mat-card-title>
              <mat-card-subtitle>
                Across {{ accountSummary()!.totalAccounts }} accounts
              </mat-card-subtitle>
            </div>
          </mat-card-header>
          <mat-card-content>
            <div class="summary-value">
              {{ formatCurrency(accountSummary()!.totalBalance) }}
            </div>
          </mat-card-content>
        </mat-card>
      </div>
      }

      <!-- Accounts Grid -->
      @if (accounts().length === 0) {
      <mat-card class="empty-state-card">
        <mat-card-content>
          <div class="empty-state">
            <mat-icon>account_balance_wallet</mat-icon>
            <h3>No Accounts Yet</h3>
            <p>Add your first account to start tracking your finances</p>
            <button
              mat-raised-button
              color="primary"
              (click)="openAccountDialog()"
              class="get-started-button"
            >
              <mat-icon>add</mat-icon>
              Add Your First Account
            </button>
          </div>
        </mat-card-content>
      </mat-card>
      } @else {
      <div class="accounts-grid">
        @for (account of accounts(); track account.id) {
        <mat-card
          class="account-card"
          [class.has-activity]="hasAccountActivity(account)"
        >
          <mat-card-header>
            <div class="account-avatar">
              <mat-icon>account_balance</mat-icon>
            </div>
            <div class="account-header-content">
              <mat-card-title class="account-name">{{
                account.name
              }}</mat-card-title>
              <mat-card-subtitle class="account-currency">{{
                account.currency
              }}</mat-card-subtitle>
            </div>
            <div class="account-status">
              <mat-icon class="status-icon active">check_circle</mat-icon>
            </div>
          </mat-card-header>

          <mat-card-content>
            @if (account.description) {
            <div class="account-description">{{ account.description }}</div>
            }

            <div class="balance-section">
              <div class="current-balance">
                <span class="balance-label">Current Balance</span>
                <span class="balance-amount">
                  {{
                    formatCurrency(
                      account.currentBalance ?? account.initialBalance
                    )
                  }}
                  <span class="currency">{{ account.currency }}</span>
                </span>
              </div>

              @if (account.currentBalance !== undefined &&
              hasAccountActivity(account)) {
              <div class="balance-breakdown">
                <div class="breakdown-item">
                  <span class="breakdown-label">Initial:</span>
                  <span class="breakdown-value">{{
                    formatCurrency(account.initialBalance)
                  }}</span>
                </div>

                @if (account.totalIncome && account.totalIncome > 0) {
                <div class="breakdown-item positive">
                  <span class="breakdown-label">+ Income:</span>
                  <span class="breakdown-value">{{
                    formatCurrency(account.totalIncome)
                  }}</span>
                </div>
                } @if (account.totalExpenses && account.totalExpenses > 0) {
                <div class="breakdown-item negative">
                  <span class="breakdown-label">- Expenses:</span>
                  <span class="breakdown-value">{{
                    formatCurrency(account.totalExpenses)
                  }}</span>
                </div>
                } @if (account.transfersIn && account.transfersIn > 0) {
                <div class="breakdown-item positive">
                  <span class="breakdown-label">+ Transfers In:</span>
                  <span class="breakdown-value">{{
                    formatCurrency(account.transfersIn)
                  }}</span>
                </div>
                } @if (account.transfersOut && account.transfersOut > 0) {
                <div class="breakdown-item negative">
                  <span class="breakdown-label">- Transfers Out:</span>
                  <span class="breakdown-value">{{
                    formatCurrency(account.transfersOut)
                  }}</span>
                </div>
                }
              </div>

              @if (account.currentBalance !== account.initialBalance) {
              <div class="net-change">
                <mat-chip
                  class="change-chip"
                  [class.positive]="
                    account.currentBalance > account.initialBalance
                  "
                  [class.negative]="
                    account.currentBalance < account.initialBalance
                  "
                >
                  <mat-icon>{{
                    account.currentBalance > account.initialBalance
                      ? 'trending_up'
                      : 'trending_down'
                  }}</mat-icon>
                  {{ account.currentBalance > account.initialBalance ? '+' : ''
                  }}{{
                    formatCurrency(
                      account.currentBalance - account.initialBalance
                    )
                  }}
                </mat-chip>
              </div>
              } }
            </div>

            <div class="account-meta">
              <span class="account-date">
                <mat-icon>schedule</mat-icon>
                Created {{ formatDate(account.timestamp) }}
              </span>
            </div>
          </mat-card-content>

          <mat-card-actions class="account-actions">
            <button
              mat-icon-button
              (click)="openAccountDialog(account)"
              class="edit-button"
              matTooltip="Edit account"
            >
              <mat-icon>edit</mat-icon>
            </button>
            <button
              mat-icon-button
              (click)="deleteAccount(account)"
              class="delete-button"
              [disabled]="deleting().has(account.id)"
              matTooltip="Delete account"
            >
              @if (deleting().has(account.id)) {
              <mat-spinner diameter="16"></mat-spinner>
              } @else {
              <mat-icon>delete</mat-icon>
              }
            </button>
          </mat-card-actions>
        </mat-card>
        }
      </div>
      } }
    </div>
  `,
})
export class AccountsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);
  private readonly dialog = inject(MatDialog);

  loading = signal(true);
  deleting = signal(new Set<string>());
  accounts = signal<Account[]>([]);
  accountSummary = signal<AccountSummary | null>(null);

  ngOnInit() {
    this.loadAccounts();
  }

  private async loadAccounts() {
    try {
      this.loading.set(true);
      const [accounts, summary] = await Promise.all([
        firstValueFrom(this.apiService.getAllAccounts()),
        firstValueFrom(this.apiService.getAccountSummary()),
      ]);
      this.accounts.set(accounts);
      this.accountSummary.set(summary);
    } catch (error) {
      this.snackBar.open('Failed to load accounts', 'Close', {
        duration: 3000,
      });
      console.error('Error loading accounts:', error);
    } finally {
      this.loading.set(false);
    }
  }

  openAccountDialog(account?: Account) {
    const dialogRef = this.dialog.open(AccountDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      data: { account },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && !result.error) {
        // Reload accounts after successful create/update
        this.loadAccounts();
        const message = account
          ? 'Account updated successfully'
          : 'Account created successfully';
        this.snackBar.open(message, 'Close', {
          duration: 3000,
        });
      } else if (result && result.error) {
        const message = account
          ? 'Failed to update account'
          : 'Failed to create account';
        this.snackBar.open(message, 'Close', {
          duration: 3000,
        });
      }
    });
  }

  async deleteAccount(account: Account) {
    const confirmed = await firstValueFrom(
      this.dialogService.confirm(
        `Are you sure you want to delete the account "${account.name}"?`,
        'Delete Account',
        'Delete',
        'Cancel'
      )
    );

    if (!confirmed) return;

    // Add to deleting set
    const newDeleting = new Set(this.deleting());
    newDeleting.add(account.id);
    this.deleting.set(newDeleting);

    try {
      await firstValueFrom(this.apiService.deleteAccount(account.id));
      this.accounts.update((accounts) =>
        accounts.filter((a) => a.id !== account.id)
      );
      this.snackBar.open('Account deleted successfully', 'Close', {
        duration: 3000,
      });

      // Reload summary
      const summary = await firstValueFrom(this.apiService.getAccountSummary());
      this.accountSummary.set(summary);
    } catch (error) {
      this.snackBar.open('Failed to delete account', 'Close', {
        duration: 3000,
      });
      console.error('Error deleting account:', error);
    } finally {
      // Remove from deleting set
      const updatedDeleting = new Set(this.deleting());
      updatedDeleting.delete(account.id);
      this.deleting.set(updatedDeleting);
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  }

  hasAccountActivity(account: Account): boolean {
    return !!(
      account.totalIncome ||
      account.totalExpenses ||
      account.transfersIn ||
      account.transfersOut
    );
  }
}
