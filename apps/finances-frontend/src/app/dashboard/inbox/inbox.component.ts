import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  FinanceApiService,
  Transaction,
  Category,
  Tag,
  TransactionType,
} from '../../services/finance-api.service';

@Component({
  selector: 'app-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="inbox-container">
      @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="48"></mat-spinner>
        <p>Loading transactions to review...</p>
      </div>
      } @else if (transactions().length === 0) {
      <div class="empty-state">
        <mat-icon class="empty-icon">check_circle</mat-icon>
        <h2>All caught up!</h2>
        <p>You have no transactions to review.</p>
      </div>
      } @else {
      <div class="inbox-header">
        <div class="header-info">
          <h2>{{ transactions().length }} transactions to review</h2>
          <p>Categorize and tag your new transactions</p>
        </div>
        <div class="header-actions">
          @if (selectedIds().size > 0) {
          <button
            mat-raised-button
            color="primary"
            (click)="bulkMarkReviewed()"
            [disabled]="processingBulk()"
          >
            <mat-icon>done_all</mat-icon>
            Mark {{ selectedIds().size }} as Reviewed
          </button>
          }
          <button mat-stroked-button (click)="toggleSelectAll()">
            {{ allSelected() ? 'Deselect All' : 'Select All' }}
          </button>
        </div>
      </div>

      <div class="transaction-list">
        @for (tx of transactions(); track tx.id) {
        <mat-card
          class="transaction-card"
          [class.selected]="selectedIds().has(tx.id)"
        >
          <div class="card-checkbox">
            <mat-checkbox
              [checked]="selectedIds().has(tx.id)"
              (change)="toggleSelection(tx.id)"
            ></mat-checkbox>
          </div>

          <div class="card-main">
            <div class="tx-header">
              <div class="tx-info">
                <span class="tx-date">{{
                  tx.date | date : 'MMM d, yyyy'
                }}</span>
                <span class="tx-account">{{ tx.accountName }}</span>
                @if (tx.institutionName) {
                <span class="tx-institution">{{ tx.institutionName }}</span>
                }
              </div>
              <div
                class="tx-amount"
                [class.income]="tx.type === TransactionType.INCOME"
                [class.expense]="tx.type === TransactionType.EXPENSE"
              >
                {{
                  tx.type === TransactionType.INCOME
                    ? '+'
                    : tx.type === TransactionType.EXPENSE
                    ? '-'
                    : ''
                }}{{ formatCurrency(Math.abs(tx.amount)) }}
              </div>
            </div>

            <div class="tx-details">
              <div class="tx-name">{{ tx.merchantName || tx.name }}</div>
              @if (tx.plaidPersonalFinanceCategory) {
              <span
                class="tx-plaid-category"
                matTooltip="Plaid suggested category"
              >
                <mat-icon>auto_awesome</mat-icon>
                {{ tx.plaidPersonalFinanceCategory }}
              </span>
              }
            </div>

            <div class="tx-actions">
              <mat-form-field appearance="outline" class="category-select">
                <mat-label>Category</mat-label>
                <mat-select
                  [value]="tx.category"
                  (selectionChange)="updateCategory(tx, $event.value)"
                >
                  <mat-option [value]="null">No category</mat-option>
                  @for (cat of categories(); track cat.id) {
                  <mat-option [value]="cat.id">
                    {{ cat.name }}
                  </mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="tags-select">
                <mat-label>Tags</mat-label>
                <mat-select
                  multiple
                  [value]="tx.tags"
                  (selectionChange)="updateTags(tx, $event.value)"
                >
                  @for (tag of tags(); track tag.id) {
                  <mat-option [value]="tag.id">
                    {{ tag.name }}
                  </mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <button
                mat-icon-button
                color="primary"
                matTooltip="Mark as reviewed"
                (click)="markReviewed(tx)"
                [disabled]="processingIds().has(tx.id)"
              >
                @if (processingIds().has(tx.id)) {
                <mat-spinner diameter="20"></mat-spinner>
                } @else {
                <mat-icon>check</mat-icon>
                }
              </button>
            </div>
          </div>
        </mat-card>
        }
      </div>
      }
    </div>
  `,
  styles: `
    @import 'styles/variables';
    
    .inbox-container {
      max-width: 960px;
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
        margin: 0;
        font-size: 0.95rem;
      }
    }

    .inbox-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      flex-wrap: wrap;
      gap: 20px;
      
      .header-info {
        h2 {
          margin: 0 0 6px;
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--mat-sys-on-surface);
          letter-spacing: -0.02em;
        }
        
        p {
          margin: 0;
          color: var(--mat-sys-on-surface-variant);
          font-size: 0.9rem;
        }
      }
      
      .header-actions {
        display: flex;
        gap: 12px;
        
        button {
          border-radius: 12px;
        }
      }
    }

    .transaction-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .transaction-card {
      display: flex;
      padding: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      transition: all 0.25s ease;
      
      &:hover {
        background: var(--bg-card-hover);
        border-color: var(--border-default);
      }
      
      &.selected {
        border-color: rgba(var(--mat-sys-primary-rgb), 0.5);
        background: rgba(var(--mat-sys-primary-rgb), 0.06);
        
        &:hover {
          background: rgba(var(--mat-sys-primary-rgb), 0.08);
        }
      }
    }

    .card-checkbox {
      display: flex;
      align-items: flex-start;
      padding-right: 16px;
    }

    .card-main {
      flex: 1;
      min-width: 0;
    }

    .tx-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .tx-info {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
      
      .tx-date {
        font-weight: 500;
      }
      
      .tx-account {
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
    }

    .tx-amount {
      font-size: 1.35rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
      
      &.income { color: var(--mat-sys-primary); }
      &.expense { color: var(--mat-sys-error); }
    }

    .tx-details {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .tx-name {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .tx-plaid-category {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: var(--mat-sys-tertiary);
      background: rgba(var(--mat-sys-tertiary-rgb), 0.12);
      padding: 4px 10px;
      border-radius: 8px;
      font-weight: 500;
      
      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
    }

    .tx-actions {
      display: flex;
      gap: 16px;
      align-items: center;
      
      .category-select, .tags-select {
        flex: 1;
        max-width: 200px;
      }
      
      button[mat-icon-button] {
        background: rgba(var(--mat-sys-primary-rgb), 0.1);
        
        &:hover {
          background: rgba(var(--mat-sys-primary-rgb), 0.2);
        }
      }
    }

    ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    @media (max-width: 768px) {
      .inbox-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .tx-actions {
        flex-wrap: wrap;
        gap: 12px;
        
        .category-select, .tags-select {
          max-width: 100%;
          min-width: 140px;
        }
      }
      
      .transaction-card {
        padding: 16px;
      }
      
      .tx-amount {
        font-size: 1.2rem;
      }
    }
  `,
})
export class InboxComponent implements OnInit {
  private readonly api = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly TransactionType = TransactionType;
  readonly Math = Math;

  transactions = signal<Transaction[]>([]);
  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);
  loading = signal(true);
  processingIds = signal<Set<string>>(new Set());
  processingBulk = signal(false);
  selectedIds = signal<Set<string>>(new Set());

  allSelected = computed(() => {
    const txs = this.transactions();
    const selected = this.selectedIds();
    return txs.length > 0 && txs.every((tx) => selected.has(tx.id));
  });

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.loading.set(true);

    // Load categories and tags first
    this.api.getAllCategories().subscribe({
      next: (cats) => this.categories.set(cats),
      error: (err) => console.error('Failed to load categories', err),
    });

    this.api.getAllTags().subscribe({
      next: (tags) => this.tags.set(tags),
      error: (err) => console.error('Failed to load tags', err),
    });

    // Load inbox transactions
    this.api.getInboxTransactions().subscribe({
      next: (txs) => {
        this.transactions.set(txs);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load inbox transactions', err);
        this.loading.set(false);
      },
    });
  }

  toggleSelection(id: string) {
    const current = new Set(this.selectedIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedIds.set(current);
  }

  toggleSelectAll() {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.transactions().map((tx) => tx.id)));
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  }

  updateCategory(tx: Transaction, categoryId: string | null) {
    const processing = new Set(this.processingIds());
    processing.add(tx.id);
    this.processingIds.set(processing);

    this.api.updateTransaction(tx.id, { category: categoryId }).subscribe({
      next: (updated) => {
        this.updateTransactionInList(updated);
        this.removeFromProcessing(tx.id);
      },
      error: (err) => {
        console.error('Failed to update category', err);
        this.snackBar.open('Failed to update category', 'Dismiss', {
          duration: 3000,
        });
        this.removeFromProcessing(tx.id);
      },
    });
  }

  updateTags(tx: Transaction, tagIds: string[]) {
    const processing = new Set(this.processingIds());
    processing.add(tx.id);
    this.processingIds.set(processing);

    this.api.updateTransaction(tx.id, { tags: tagIds }).subscribe({
      next: (updated) => {
        this.updateTransactionInList(updated);
        this.removeFromProcessing(tx.id);
      },
      error: (err) => {
        console.error('Failed to update tags', err);
        this.snackBar.open('Failed to update tags', 'Dismiss', {
          duration: 3000,
        });
        this.removeFromProcessing(tx.id);
      },
    });
  }

  markReviewed(tx: Transaction) {
    const processing = new Set(this.processingIds());
    processing.add(tx.id);
    this.processingIds.set(processing);

    this.api.markTransactionReviewed(tx.id).subscribe({
      next: () => {
        this.transactions.update((txs) => txs.filter((t) => t.id !== tx.id));
        this.removeFromProcessing(tx.id);
        this.snackBar.open('Transaction marked as reviewed', 'Dismiss', {
          duration: 2000,
        });
      },
      error: (err) => {
        console.error('Failed to mark as reviewed', err);
        this.snackBar.open('Failed to mark as reviewed', 'Dismiss', {
          duration: 3000,
        });
        this.removeFromProcessing(tx.id);
      },
    });
  }

  bulkMarkReviewed() {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    this.processingBulk.set(true);

    this.api.bulkMarkReviewed(ids).subscribe({
      next: (result) => {
        this.transactions.update((txs) =>
          txs.filter((t) => !ids.includes(t.id))
        );
        this.selectedIds.set(new Set());
        this.processingBulk.set(false);
        this.snackBar.open(
          `${result.updated} transactions marked as reviewed`,
          'Dismiss',
          { duration: 2000 }
        );
      },
      error: (err) => {
        console.error('Failed to bulk mark as reviewed', err);
        this.snackBar.open(
          'Failed to mark transactions as reviewed',
          'Dismiss',
          { duration: 3000 }
        );
        this.processingBulk.set(false);
      },
    });
  }

  private updateTransactionInList(updated: Transaction) {
    this.transactions.update((txs) =>
      txs.map((t) => (t.id === updated.id ? updated : t))
    );
  }

  private removeFromProcessing(id: string) {
    const processing = new Set(this.processingIds());
    processing.delete(id);
    this.processingIds.set(processing);
  }
}
