import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  FinanceApiService,
  Account,
  AccountInput,
  AccountSummary,
} from '../../services/finance-api.service';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-accounts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatDividerModule,
    MatTooltipModule,
    MatSelectModule,
    MatSlideToggleModule,
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
        <mat-card class="summary-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>account_balance</mat-icon>
              Total Balance
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="summary-value">
              {{ formatCurrency(accountSummary()!.totalBalance) }}
            </div>
            <div class="summary-meta">
              Across {{ accountSummary()!.totalAccounts }} accounts
            </div>
          </mat-card-content>
        </mat-card>
      </div>
      }

      <!-- Quick Add Form -->
      <mat-card class="quick-add-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>add_circle</mat-icon>
            Add Account
          </mat-card-title>
          <mat-card-subtitle
            >Create a new financial account to track</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="accountForm" class="quick-add-form">
            <div class="form-row">
              <mat-form-field appearance="outline" class="account-name-field">
                <mat-label>Account Name</mat-label>
                <input
                  matInput
                  formControlName="name"
                  required
                  placeholder="e.g., Chase Checking, Savings Account"
                />
                <mat-icon matSuffix>account_balance</mat-icon>
              </mat-form-field>

              <mat-form-field
                appearance="outline"
                class="account-currency-field"
              >
                <mat-label>Currency</mat-label>
                <mat-select formControlName="currency">
                  <mat-option value="CAD">CAD</mat-option>
                  <mat-option value="USD">USD</mat-option>
                  <mat-option value="EUR">EUR</mat-option>
                  <mat-option value="GBP">GBP</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <div class="form-row">
              <mat-form-field
                appearance="outline"
                class="account-balance-field"
              >
                <mat-label>Initial Balance</mat-label>
                <input
                  matInput
                  formControlName="initialBalance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                />
                <span matSuffix>{{ accountForm.value.currency || 'CAD' }}</span>
              </mat-form-field>
            </div>

            <mat-form-field
              appearance="outline"
              class="account-description-field"
            >
              <mat-label>Description (Optional)</mat-label>
              <textarea
                matInput
                formControlName="description"
                rows="2"
                placeholder="Additional details about this account"
              ></textarea>
            </mat-form-field>

            <button
              mat-raised-button
              color="primary"
              (click)="addAccount()"
              [disabled]="!accountForm.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
              Adding... } @else {
              <ng-container>
                <mat-icon>add</mat-icon>
                Add Account
              </ng-container>
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Accounts List -->
      <mat-card class="accounts-list-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>list</mat-icon>
            All Accounts
          </mat-card-title>
          <mat-card-subtitle
            >Manage your {{ accounts().length }} accounts</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (accounts().length === 0) {
          <div class="empty-state">
            <mat-icon>account_balance_wallet</mat-icon>
            <h3>No Accounts Yet</h3>
            <p>Add your first account above to start tracking your finances</p>
          </div>
          } @else {
          <div class="accounts-grid">
            @for (account of accounts(); track account.id) {
            <div class="account-card">
              <div class="account-header">
                <div class="account-icon">
                  <mat-icon>account_balance</mat-icon>
                </div>
                <div class="account-status">
                  <mat-icon class="status-icon active">check_circle</mat-icon>
                </div>
              </div>

              <div class="account-info">
                <div class="account-name">{{ account.name }}</div>
                @if (account.description) {
                <div class="account-description">{{ account.description }}</div>
                }
                <div class="account-meta">
                  <span class="account-balance"
                    >{{
                      formatCurrency(
                        account.currentBalance ?? account.initialBalance
                      )
                    }}
                    {{ account.currency }}</span
                  >
                  @if (account.currentBalance !== undefined &&
                  account.currentBalance !== account.initialBalance) {
                  <span
                    class="balance-change"
                    [class.positive]="
                      account.currentBalance > account.initialBalance
                    "
                    [class.negative]="
                      account.currentBalance < account.initialBalance
                    "
                  >
                    ({{
                      account.currentBalance > account.initialBalance
                        ? '+'
                        : ''
                    }}{{
                      formatCurrency(
                        account.currentBalance - account.initialBalance
                      )
                    }}
                    change)
                  </span>
                  }
                  <span class="account-date"
                    >Created {{ formatDate(account.timestamp) }}</span
                  >
                </div>
              </div>

              <div class="account-actions">
                <button
                  mat-icon-button
                  (click)="editAccount(account)"
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
              </div>
            </div>
            }
          </div>
          }
        </mat-card-content>
      </mat-card>

      }
    </div>
  `,
})
export class AccountsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());
  accounts = signal<Account[]>([]);
  accountSummary = signal<AccountSummary | null>(null);

  accountForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    initialBalance: [0, [Validators.min(0)]],
    currency: ['CAD', Validators.required],
  });

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

  async addAccount() {
    if (!this.accountForm.valid) return;

    this.submitting.set(true);
    try {
      const accountData: AccountInput = this.accountForm.value;
      const newAccount = await firstValueFrom(
        this.apiService.createAccount(accountData)
      );

      this.accounts.update((accounts) => [...accounts, newAccount]);
      this.accountForm.reset({
        initialBalance: 0,
        currency: 'CAD',
      });
      this.snackBar.open('Account created successfully', 'Close', {
        duration: 3000,
      });

      // Reload summary
      const summary = await firstValueFrom(this.apiService.getAccountSummary());
      this.accountSummary.set(summary);
    } catch (error) {
      this.snackBar.open('Failed to create account', 'Close', {
        duration: 3000,
      });
      console.error('Error creating account:', error);
    } finally {
      this.submitting.set(false);
    }
  }

  async editAccount(account: Account) {
    // For now, just populate the form - in a real app you might open a dialog
    this.accountForm.patchValue({
      name: account.name,
      description: account.description,
      initialBalance: account.initialBalance,
      currency: account.currency,
    });
    this.snackBar.open('Account loaded for editing', 'Close', {
      duration: 2000,
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
}
