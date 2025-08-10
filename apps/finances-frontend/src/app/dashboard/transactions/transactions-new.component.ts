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
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import {
  FinanceApiService,
  Transaction,
} from '../../services/finance-api.service';

@Component({
  selector: 'app-transactions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatMenuModule,
  ],
  template: `
    <div class="transactions-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h1 class="page-title">Transactions</h1>
          <p class="page-subtitle">Manage your income and expenses</p>
        </div>
        <button
          mat-raised-button
          color="primary"
          (click)="toggleAddForm()"
          class="add-button"
        >
          <mat-icon>{{ showAddForm() ? 'close' : 'add' }}</mat-icon>
          {{ showAddForm() ? 'Cancel' : 'Add Transaction' }}
        </button>
      </div>

      <!-- Add/Edit Transaction Form -->
      @if (showAddForm() || editingTransaction()) {
      <mat-card class="transaction-form-card">
        <mat-card-header>
          <mat-card-title>
            {{
              editingTransaction() ? 'Edit Transaction' : 'Add New Transaction'
            }}
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="transactionForm" class="transaction-form">
            <div class="form-row">
              <mat-form-field appearance="outline" class="type-field">
                <mat-label>Type</mat-label>
                <mat-select formControlName="type" required>
                  <mat-option value="INCOME">Income</mat-option>
                  <mat-option value="EXPENSE">Expense</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="amount-field">
                <mat-label>Amount</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="amount"
                  required
                  min="0"
                  step="0.01"
                />
                <span matTextPrefix>$</span>
              </mat-form-field>
            </div>

            <div class="form-row">
              <mat-form-field appearance="outline" class="category-field">
                <mat-label>Category</mat-label>
                <mat-select formControlName="category" required>
                  @for (category of categories(); track category) {
                  <mat-option [value]="category">{{ category }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="medium-field">
                <mat-label>Payment Method</mat-label>
                <mat-select formControlName="medium" required>
                  @for (medium of mediums(); track medium) {
                  <mat-option [value]="medium">{{ medium }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>

            <div class="form-row">
              <mat-form-field appearance="outline" class="date-field">
                <mat-label>Date</mat-label>
                <input matInput type="date" formControlName="date" required />
              </mat-form-field>

              <mat-form-field appearance="outline" class="tags-field">
                <mat-label>Tags (comma separated)</mat-label>
                <input
                  matInput
                  formControlName="tagsInput"
                  placeholder="e.g., urgent, business"
                />
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="description-field">
              <mat-label>Description</mat-label>
              <textarea
                matInput
                formControlName="description"
                required
                rows="3"
              ></textarea>
            </mat-form-field>

            <div class="form-actions">
              <button
                mat-button
                type="button"
                (click)="cancelForm()"
                class="cancel-button"
              >
                Cancel
              </button>
              <button
                mat-raised-button
                color="primary"
                type="submit"
                (click)="saveTransaction()"
                [disabled]="!transactionForm.valid || submitting()"
                class="save-button"
              >
                @if (submitting()) {
                <mat-spinner diameter="20"></mat-spinner>
                } @else {
                {{ editingTransaction() ? 'Update' : 'Save' }} Transaction }
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
      }

      <!-- Transactions List -->
      <mat-card class="transactions-list-card">
        <mat-card-header>
          <mat-card-title>All Transactions</mat-card-title>
          <mat-card-subtitle
            >{{ transactions().length }} transactions total</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <p>Loading transactions...</p>
          </div>
          } @else if (transactions().length === 0) {
          <div class="empty-state">
            <mat-icon>receipt_long</mat-icon>
            <h3>No transactions yet</h3>
            <p>
              Click the "Add Transaction" button to add your first transaction
            </p>
          </div>
          } @else {
          <div class="transactions-list">
            @for (transaction of transactions(); track transaction.id) {
            <div
              class="transaction-item"
              [class]="transaction.type.toLowerCase()"
            >
              <div class="transaction-main">
                <div class="transaction-info">
                  <div class="transaction-description">
                    {{ transaction.description }}
                  </div>
                  <div class="transaction-meta">
                    <span class="transaction-category">{{
                      transaction.category
                    }}</span>
                    <span class="separator">•</span>
                    <span class="transaction-medium">{{
                      transaction.medium
                    }}</span>
                    <span class="separator">•</span>
                    <span class="transaction-date">{{
                      formatDate(transaction.date)
                    }}</span>
                  </div>
                  @if (transaction.tags.length > 0) {
                  <div class="transaction-tags">
                    @for (tag of transaction.tags; track tag) {
                    <span class="tag-chip">{{ tag }}</span>
                    }
                  </div>
                  }
                </div>
                <div class="transaction-amount-section">
                  <div
                    class="transaction-amount"
                    [class]="transaction.type.toLowerCase()"
                  >
                    {{ transaction.type === 'INCOME' ? '+' : '-'
                    }}{{ formatCurrency(transaction.amount) }}
                  </div>
                  <div
                    class="transaction-type-badge"
                    [class]="transaction.type.toLowerCase()"
                  >
                    {{ transaction.type === 'INCOME' ? 'Income' : 'Expense' }}
                  </div>
                </div>
              </div>
              <div class="transaction-actions">
                <button
                  mat-icon-button
                  [matMenuTriggerFor]="actionMenu"
                  class="action-button"
                >
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #actionMenu="matMenu">
                  <button mat-menu-item (click)="editTransaction(transaction)">
                    <mat-icon>edit</mat-icon>
                    <span>Edit</span>
                  </button>
                  <button
                    mat-menu-item
                    (click)="deleteTransaction(transaction.id!)"
                    class="delete-action"
                  >
                    <mat-icon>delete</mat-icon>
                    <span>Delete</span>
                  </button>
                </mat-menu>
              </div>
            </div>
            }
          </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .transactions-container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 0 16px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .header-content {
      flex: 1;
    }

    .page-title {
      font-size: 2rem;
      font-weight: 400;
      margin: 0;
      color: var(--mat-sys-primary);
    }

    .page-subtitle {
      color: var(--mat-sys-on-surface-variant);
      margin: 4px 0 0 0;
    }

    .add-button {
      margin-left: 16px;
      gap: 8px;
    }

    .transaction-form-card {
      margin-bottom: 24px;
      border: 2px solid var(--mat-sys-primary);
    }

    .transaction-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: flex;
      gap: 16px;
    }

    .form-row > * {
      flex: 1;
    }

    .type-field,
    .amount-field {
      min-width: 200px;
    }

    .category-field,
    .medium-field {
      min-width: 200px;
    }

    .date-field,
    .tags-field {
      min-width: 200px;
    }

    .description-field {
      width: 100%;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 16px;
      margin-top: 16px;
    }

    .save-button {
      min-width: 120px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      gap: 16px;
    }

    .empty-state {
      text-align: center;
      padding: 64px 32px;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state h3 {
      margin: 16px 0 8px 0;
      color: var(--mat-primary-text-color);
    }

    .transactions-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .transaction-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      margin-bottom: 8px;
      background: var(--mat-sys-surface);
      transition: all 0.2s ease;
    }

    .transaction-item:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transform: translateY(-1px);
    }

    .transaction-item.income {
      border-left: 4px solid var(--mat-success-color, #4caf50);
    }

    .transaction-item.expense {
      border-left: 4px solid var(--mat-error-color, #f44336);
    }

    .transaction-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex: 1;
      margin-right: 16px;
    }

    .transaction-info {
      flex: 1;
    }

    .transaction-description {
      font-size: 1.1rem;
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--mat-primary-text-color);
    }

    .transaction-meta {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: 8px;
    }

    .separator {
      margin: 0 8px;
    }

    .transaction-tags {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .tag-chip {
      background: var(--mat-primary-container-color);
      color: var(--mat-on-primary-container-color);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .transaction-amount-section {
      text-align: right;
      margin-left: 16px;
    }

    .transaction-amount {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .transaction-amount.income {
      color: var(--mat-success-color, #4caf50);
    }

    .transaction-amount.expense {
      color: var(--mat-error-color, #f44336);
    }

    .transaction-type-badge {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .transaction-type-badge.income {
      background: rgba(76, 175, 80, 0.1);
      color: var(--mat-success-color, #4caf50);
    }

    .transaction-type-badge.expense {
      background: rgba(244, 67, 54, 0.1);
      color: var(--mat-error-color, #f44336);
    }

    .transaction-actions {
      margin-left: 8px;
    }

    .action-button {
      color: var(--mat-sys-on-surface-variant);
    }

    .delete-action {
      color: var(--mat-error-color);
    }

    @media (max-width: 768px) {
      .form-row {
        flex-direction: column;
      }

      .page-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }

      .add-button {
        margin-left: 0;
        align-self: flex-end;
      }

      .transaction-main {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }

      .transaction-amount-section {
        text-align: left;
        margin-left: 0;
        align-self: flex-end;
      }
    }
  `,
})
export class TransactionsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  submitting = signal(false);
  showAddForm = signal(false);
  editingTransaction = signal<Transaction | null>(null);

  transactions = signal<Transaction[]>([]);
  categories = signal<string[]>([]);
  mediums = signal<string[]>([]);
  tags = signal<string[]>([]);

  transactionForm: FormGroup = this.fb.group({
    type: ['EXPENSE', Validators.required],
    amount: ['', [Validators.required, Validators.min(0.01)]],
    category: ['', Validators.required],
    medium: ['', Validators.required],
    date: [new Date().toISOString().split('T')[0], Validators.required],
    tagsInput: [''],
    description: ['', Validators.required],
  });

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    // Load transactions
    this.apiService.getAllTransactions().subscribe({
      next: (transactions) => {
        this.transactions.set(transactions);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading transactions:', error);
        this.loading.set(false);
        this.snackBar.open('Error loading transactions', 'Close', {
          duration: 3000,
        });
      },
    });

    // Load categories
    this.apiService.getAllCategories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: (error) => console.error('Error loading categories:', error),
    });

    // Load mediums
    this.apiService.getAllMediums().subscribe({
      next: (mediums) => this.mediums.set(mediums),
      error: (error) => console.error('Error loading mediums:', error),
    });

    // Load tags
    this.apiService.getAllTags().subscribe({
      next: (tags) => this.tags.set(tags),
      error: (error) => console.error('Error loading tags:', error),
    });
  }

  toggleAddForm() {
    this.showAddForm.set(!this.showAddForm());
    if (!this.showAddForm()) {
      this.cancelForm();
    }
  }

  saveTransaction() {
    if (!this.transactionForm.valid) return;

    this.submitting.set(true);
    const formValue = this.transactionForm.value;

    const transaction = {
      type: formValue.type,
      amount: parseFloat(formValue.amount),
      category: formValue.category,
      medium: formValue.medium,
      date: formValue.date,
      tags: formValue.tagsInput
        ? formValue.tagsInput
            .split(',')
            .map((tag: string) => tag.trim())
            .filter((tag: string) => tag)
        : [],
      description: formValue.description,
    };

    const operation = this.editingTransaction()
      ? this.apiService.updateTransaction(
          this.editingTransaction()!.id!,
          transaction
        )
      : this.apiService.createTransaction(transaction);

    operation.subscribe({
      next: (savedTransaction) => {
        this.submitting.set(false);
        this.snackBar.open(
          `Transaction ${
            this.editingTransaction() ? 'updated' : 'created'
          } successfully`,
          'Close',
          { duration: 3000 }
        );
        this.cancelForm();
        this.loadData(); // Reload data
      },
      error: (error) => {
        console.error('Error saving transaction:', error);
        this.submitting.set(false);
        this.snackBar.open('Error saving transaction', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  editTransaction(transaction: Transaction) {
    this.editingTransaction.set(transaction);
    this.showAddForm.set(true);

    // Parse tags back to comma-separated string
    const tagsString = transaction.tags.join(', ');

    this.transactionForm.patchValue({
      type: transaction.type,
      amount: transaction.amount,
      category: transaction.category,
      medium: transaction.medium,
      date: transaction.date,
      tagsInput: tagsString,
      description: transaction.description,
    });
  }

  deleteTransaction(id: string) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    this.apiService.deleteTransaction(id).subscribe({
      next: () => {
        this.snackBar.open('Transaction deleted successfully', 'Close', {
          duration: 3000,
        });
        this.loadData(); // Reload data
      },
      error: (error) => {
        console.error('Error deleting transaction:', error);
        this.snackBar.open('Error deleting transaction', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  cancelForm() {
    this.showAddForm.set(false);
    this.editingTransaction.set(null);
    this.transactionForm.reset({
      type: 'EXPENSE',
      date: new Date().toISOString().split('T')[0],
    });
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
}
