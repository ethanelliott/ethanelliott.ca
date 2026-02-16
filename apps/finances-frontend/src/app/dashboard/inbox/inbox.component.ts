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
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import {
  FinanceApiService,
  Transaction,
  Category,
  Tag,
  TransactionType,
} from '../../services/finance-api.service';
import { firstValueFrom } from 'rxjs';

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
    MatAutocompleteModule,
  ],
  template: `
    <div class="inbox-container">
      @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Loading transactions...</p>
      </div>
      } @else if (transactions().length === 0) {
      <div class="empty-state">
        <mat-icon>check_circle</mat-icon>
        <h2>All caught up!</h2>
        <p>No transactions to review.</p>
      </div>
      } @else {
      <!-- Current Transaction Editor -->
      @if (currentTransaction(); as tx) {
      <div class="editor-section">
        <div class="editor-card">
          <div class="editor-main">
            <div class="editor-top-row">
              <div class="editor-info">
                <span class="editor-date">{{
                  tx.date | date : 'MMM d, yyyy'
                }}</span>
                <span class="editor-account">{{ tx.accountName }}</span>
                @if (tx.institutionName) {
                <span class="editor-institution">{{ tx.institutionName }}</span>
                }
              </div>
              <div
                class="editor-amount"
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

            <div class="editor-merchant">
              <span class="merchant-name">{{
                tx.merchantName || tx.name
              }}</span>
              @if (tx.plaidPersonalFinanceCategory) {
              <span class="plaid-suggestion">
                <mat-icon>auto_awesome</mat-icon>
                {{ formatCategoryName(tx.plaidPersonalFinanceCategory) }}
              </span>
              }
            </div>

            @if (tx.linkedTransferId && inboxLinkedTransfer()) {
            <div class="inbox-transfer-card">
              <mat-icon>swap_horiz</mat-icon>
              <span class="transfer-text"
                >Transfer {{ tx.amount > 0 ? 'to' : 'from' }}
                <strong>{{ inboxLinkedTransfer()!.accountName }}</strong></span
              >
            </div>
            } @else if (tx.type === 'TRANSFER' && !tx.linkedTransferId) {
            <div class="inbox-transfer-card unlinked">
              <mat-icon>warning</mat-icon>
              <span class="transfer-text">Unlinked transfer</span>
            </div>
            }

            <div class="editor-inputs">
              <mat-form-field appearance="outline" class="category-field">
                <mat-label>Category</mat-label>
                <input
                  matInput
                  [matAutocomplete]="categoryAuto"
                  [(ngModel)]="categoryInput"
                  (ngModelChange)="filterCategories($event)"
                />
                <mat-autocomplete
                  #categoryAuto="matAutocomplete"
                  (optionSelected)="selectCategory(tx, $event)"
                >
                  @if (categoryInput() && !categoryExists()) {
                  <mat-option [value]="'__new__:' + categoryInput()">
                    <mat-icon>add</mat-icon> Create "{{ categoryInput() }}"
                  </mat-option>
                  } @for (cat of filteredCategories(); track cat.id) {
                  <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>

              <mat-form-field appearance="outline" class="tags-field">
                <mat-label>Tags</mat-label>
                <mat-chip-grid #chipGrid aria-label="Tag selection">
                  @for (tagId of currentTransactionTags(); track tagId) {
                  <mat-chip-row (removed)="removeTag(tx, tagId)">
                    {{ getTagName(tagId) }}
                    <button
                      matChipRemove
                      [attr.aria-label]="'remove ' + getTagName(tagId)"
                    >
                      <mat-icon>cancel</mat-icon>
                    </button>
                  </mat-chip-row>
                  }
                </mat-chip-grid>
                <input
                  #tagInputRef
                  [matChipInputFor]="chipGrid"
                  [matAutocomplete]="tagsAuto"
                  [(ngModel)]="tagInput"
                  (ngModelChange)="filterTags($event)"
                  placeholder="Add tags..."
                />
                <mat-autocomplete
                  #tagsAuto="matAutocomplete"
                  (optionSelected)="
                    selectTag(tx, $event); tagInputRef.value = ''
                  "
                >
                  @if (tagInput() && !tagExists()) {
                  <mat-option [value]="'__new__:' + tagInput()">
                    <mat-icon>add</mat-icon> Create "{{ tagInput() }}"
                  </mat-option>
                  } @for (tag of filteredTags(); track tag.id) {
                  <mat-option [value]="tag.id">{{ tag.name }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>
            </div>

            <div class="editor-actions">
              <div class="editor-buttons">
                <button
                  mat-stroked-button
                  class="skip-btn"
                  (click)="skipTransaction()"
                >
                  Skip
                </button>
                <button
                  mat-flat-button
                  color="primary"
                  class="save-btn"
                  (click)="saveAndNext(tx)"
                  [disabled]="processingIds().has(tx.id)"
                >
                  @if (processingIds().has(tx.id)) {
                  <mat-spinner diameter="18"></mat-spinner>
                  } @else {
                  <mat-icon>check</mat-icon>
                  Save & Next }
                </button>
              </div>
              <div class="editor-nav">
                <button
                  mat-icon-button
                  (click)="previousTransaction()"
                  [disabled]="currentIndex() === 0"
                >
                  <mat-icon>chevron_left</mat-icon>
                </button>
                <span class="editor-position"
                  >{{ currentIndex() + 1 }} / {{ transactions().length }}</span
                >
                <button
                  mat-icon-button
                  (click)="nextTransaction()"
                  [disabled]="currentIndex() >= transactions().length - 1"
                >
                  <mat-icon>chevron_right</mat-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      }

      <!-- Transaction List -->
      <div class="list-section">
        <div class="list-header">
          <span class="list-title">All Transactions</span>
          <div class="list-actions">
            @if (selectedIds().size > 0) {
            <button
              mat-stroked-button
              color="primary"
              (click)="bulkMarkReviewed()"
              [disabled]="processingBulk()"
            >
              <mat-icon>done_all</mat-icon>
              Mark {{ selectedIds().size }} Reviewed
            </button>
            }
            <button mat-button (click)="toggleSelectAll()">
              {{ allSelected() ? 'Deselect All' : 'Select All' }}
            </button>
          </div>
        </div>

        <div class="transaction-list">
          @for (tx of transactions(); track tx.id; let i = $index) {
          <div
            class="tx-row"
            [class.selected]="selectedIds().has(tx.id)"
            [class.current]="currentIndex() === i"
            (click)="setCurrentIndex(i)"
          >
            <mat-checkbox
              [checked]="selectedIds().has(tx.id)"
              (change)="toggleSelection(tx.id)"
              (click)="$event.stopPropagation()"
            ></mat-checkbox>
            <span class="tx-row-date">{{ tx.date | date : 'MM/dd' }}</span>
            <span class="tx-row-name">{{ tx.merchantName || tx.name }}</span>
            <span class="tx-row-account">{{ tx.accountName }}</span>
            <span class="tx-row-category" [class.has-category]="tx.category">
              {{ getCategoryName(tx.category) }}
            </span>
            <span
              class="tx-row-amount"
              [class.income]="tx.type === TransactionType.INCOME"
              [class.expense]="tx.type === TransactionType.EXPENSE"
            >
              {{ tx.type === TransactionType.EXPENSE ? '-' : ''
              }}{{ formatCurrency(Math.abs(tx.amount)) }}
            </span>
            <button
              mat-icon-button
              class="tx-row-action"
              (click)="markReviewed(tx); $event.stopPropagation()"
              [disabled]="processingIds().has(tx.id)"
            >
              @if (processingIds().has(tx.id)) {
              <mat-spinner diameter="16"></mat-spinner>
              } @else {
              <mat-icon>check</mat-icon>
              }
            </button>
          </div>
          }
        </div>
      </div>
      }
    </div>
  `,
  styles: `
    @import 'styles/variables';
    
    .inbox-container {
      max-width: 900px;
      margin: 0 auto;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 24px;
      gap: 16px;
      
      p {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.9rem;
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 24px;
      text-align: center;
      
      mat-icon {
        font-size: 56px;
        width: 56px;
        height: 56px;
        color: var(--mat-sys-primary);
        margin-bottom: 16px;
      }
      
      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
        margin: 0 0 4px;
      }
      
      p {
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
        font-size: 0.9rem;
      }
    }

    // ===== EDITOR SECTION =====
    .editor-section {
      margin-bottom: 20px;
    }

    .editor-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 16px;
    }

    .editor-top-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .editor-info {
      display: flex;
      gap: 12px;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
      flex-wrap: wrap;
      
      .editor-date { font-weight: 500; }
      .editor-account { 
        font-weight: 600; 
        color: var(--mat-sys-on-surface);
      }
    }

    .editor-amount {
      font-size: 1.5rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      
      &.income { color: var(--mat-sys-primary); }
      &.expense { color: var(--mat-sys-error); }
    }

    .editor-merchant {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
      
      .merchant-name {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      
      .plaid-suggestion {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75rem;
        color: var(--mat-sys-tertiary);
        background: rgba(var(--mat-sys-tertiary-rgb), 0.1);
        padding: 3px 8px;
        border-radius: 6px;
        
        mat-icon {
          font-size: 12px;
          width: 12px;
          height: 12px;
        }
      }
    }

    .inbox-transfer-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin-bottom: 12px;
      border-radius: 8px;
      background: rgba(var(--mat-sys-tertiary-rgb), 0.08);
      color: var(--mat-sys-tertiary);
      font-size: 0.85rem;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &.unlinked {
        background: rgba(var(--mat-sys-error-rgb), 0.08);
        color: var(--mat-sys-error);
      }

      .transfer-text strong {
        font-weight: 600;
      }
    }

    .editor-inputs {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      
      .category-field {
        flex: 1;
      }
      
      .tags-field {
        flex: 1;
        
        mat-chip-row {
          font-size: 0.85rem;
        }
        
        input {
          min-width: 80px;
        }
      }
    }

    .editor-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid var(--border-subtle);
      
      .editor-buttons {
        display: flex;
        gap: 8px;
        
        .skip-btn {
          font-size: 0.85rem;
        }
        
        .save-btn {
          min-width: 120px;
          
          mat-icon {
            margin-right: 4px;
          }
        }
      }
      
      .editor-nav {
        display: flex;
        align-items: center;
        gap: 4px;
        
        .editor-position {
          font-size: 0.8rem;
          color: var(--mat-sys-on-surface-variant);
          min-width: 60px;
          text-align: center;
        }
      }
    }

    // ===== LIST SECTION =====
    .list-section {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      overflow: hidden;
    }

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-subtle);
      
      .list-title {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
      }
      
      .list-actions {
        display: flex;
        gap: 8px;
        
        button {
          font-size: 0.8rem;
        }
      }
    }

    .transaction-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .tx-row {
      display: grid;
      grid-template-columns: 32px 55px 1fr 100px 100px 80px 36px;
      gap: 8px;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-subtle);
      cursor: pointer;
      transition: background 0.15s ease;
      
      &:last-child {
        border-bottom: none;
      }
      
      &:hover {
        background: var(--bg-subtle);
      }
      
      &.selected {
        background: rgba(var(--mat-sys-primary-rgb), 0.06);
      }
      
      &.current {
        background: rgba(var(--mat-sys-primary-rgb), 0.12);
        border-left: 3px solid var(--mat-sys-primary);
        padding-left: 9px;
      }
    }

    .tx-row-date {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }

    .tx-row-name {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-row-account {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-row-category {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      
      &.has-category {
        color: var(--mat-sys-primary);
      }
    }

    .tx-row-amount {
      font-size: 0.85rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: right;
      
      &.income { color: var(--mat-sys-primary); }
      &.expense { color: var(--mat-sys-error); }
    }

    .tx-row-action {
      width: 32px;
      height: 32px;
      
      mat-icon {
        font-size: 18px;
      }
    }

    ::ng-deep {
      .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }
      
    }

    @media (max-width: 768px) {
      .inbox-container {
        padding: 0;
      }
      
      .editor-card {
        padding: 12px;
        border-radius: 8px;
      }
      
      .editor-top-row {
        margin-bottom: 4px;
      }
      
      .editor-info {
        flex-direction: column;
        gap: 2px;
        font-size: 0.75rem;
        
        .editor-account {
          font-size: 0.8rem;
        }
        
        .editor-institution {
          display: none;
        }
      }
      
      .editor-amount {
        font-size: 1.25rem;
      }
      
      .editor-merchant {
        margin-bottom: 12px;
        
        .merchant-name {
          font-size: 1rem;
        }
        
        .plaid-suggestion {
          font-size: 0.7rem;
          padding: 2px 6px;
        }
      }
      
      .editor-inputs {
        flex-direction: column;
        gap: 8px;
        margin-bottom: 8px;
      }
      
      .tags-section {
        margin-bottom: 8px;
        
        .tags-input-wrapper {
          padding: 6px 10px;
          min-height: 36px;
        }
      }
      
      .editor-actions {
        flex-direction: column;
        gap: 10px;
        padding-top: 10px;
        
        .editor-nav {
          order: 2;
          justify-content: center;
          
          .editor-position {
            font-size: 0.75rem;
            min-width: 50px;
          }
          
          button {
            width: 32px;
            height: 32px;
          }
        }
        
        .editor-buttons {
          order: 1;
          width: 100%;
          display: flex;
          gap: 8px;
          
          .skip-btn, .save-btn {
            flex: 1;
            min-width: 0;
            font-size: 0.85rem;
            padding: 0 12px;
            height: 40px;
          }
          
          .save-btn {
            mat-icon {
              font-size: 18px;
              width: 18px;
              height: 18px;
              margin-right: 4px;
            }
          }
        }
      }
      
      .tx-row {
        grid-template-columns: 28px 45px 1fr 70px 32px;
        gap: 6px;
        padding: 6px 10px;
        
        .tx-row-category, .tx-row-account {
          display: none;
        }
      }
      
      .list-section {
        border-radius: 8px;
      }
      
      .list-header {
        padding: 8px 12px;
        
        .list-title {
          font-size: 0.8rem;
        }
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

  // New signals for editor functionality
  currentIndex = signal(0);
  categoryInput = signal('');
  filteredCategories = signal<Category[]>([]);
  tagInput = signal('');
  filteredTags = signal<Tag[]>([]);

  // Pending changes (not yet saved)
  pendingCategory = signal<string | null>(null);
  pendingTags = signal<string[]>([]);

  // Transfer info for current inbox transaction
  inboxLinkedTransfer = signal<Transaction | null>(null);

  currentTransaction = computed(() => {
    const txs = this.transactions();
    const idx = this.currentIndex();
    return txs.length > 0 && idx < txs.length ? txs[idx] : null;
  });

  // Get current category (pending or from transaction)
  currentCategory = computed(() => {
    const pending = this.pendingCategory();
    if (pending !== null) return pending;
    const tx = this.currentTransaction();
    return tx?.category ?? null;
  });

  // Get current tags (pending or from transaction)
  currentTags = computed(() => {
    const pending = this.pendingTags();
    if (pending.length > 0) return pending;
    const tx = this.currentTransaction();
    return tx?.tags ?? [];
  });

  categoryExists = computed(() => {
    const input = this.categoryInput().toLowerCase();
    return this.categories().some((c) => c.name.toLowerCase() === input);
  });

  tagExists = computed(() => {
    const input = this.tagInput().toLowerCase();
    return this.tags().some((t) => t.name.toLowerCase() === input);
  });

  currentTransactionTags = computed(() => {
    return this.currentTags();
  });

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
      next: (cats) => {
        this.categories.set(cats);
        this.filteredCategories.set(cats);
      },
      error: (err) => console.error('Failed to load categories', err),
    });

    this.api.getAllTags().subscribe({
      next: (tags) => {
        this.tags.set(tags);
        this.filteredTags.set(tags);
      },
      error: (err) => console.error('Failed to load tags', err),
    });

    // Load inbox transactions
    this.api.getInboxTransactions().subscribe({
      next: (txs) => {
        this.transactions.set(txs);
        this.loading.set(false);
        // Initialize pending tags for first transaction (tx.tags already contains names)
        if (txs.length > 0) {
          this.pendingTags.set([...txs[0].tags]);
          // tx.category is already the category name from the API
          this.categoryInput.set(txs[0].category ?? '');
          // Load linked transfer for first transaction
          this.loadLinkedTransfer(txs[0]);
        }
      },
      error: (err) => {
        console.error('Failed to load inbox transactions', err);
        this.loading.set(false);
      },
    });
  }

  // Editor navigation
  setCurrentIndex(index: number) {
    this.currentIndex.set(index);
    this.resetPendingChanges();
  }

  previousTransaction() {
    if (this.currentIndex() > 0) {
      this.currentIndex.update((i) => i - 1);
      this.resetPendingChanges();
    }
  }

  nextTransaction() {
    if (this.currentIndex() < this.transactions().length - 1) {
      this.currentIndex.update((i) => i + 1);
      this.resetPendingChanges();
    }
  }

  private resetPendingChanges() {
    this.tagInput.set('');
    this.pendingCategory.set(null);
    this.inboxLinkedTransfer.set(null);
    // Initialize pending tags from current transaction (tx.tags already contains names)
    const tx = this.currentTransaction();
    if (tx) {
      this.pendingTags.set([...tx.tags]);
      // tx.category is already the category name from the API
      this.categoryInput.set(tx.category ?? '');
      // Load linked transfer info
      this.loadLinkedTransfer(tx);
    } else {
      this.pendingTags.set([]);
      this.categoryInput.set('');
    }
  }

  private async loadLinkedTransfer(tx: Transaction) {
    if (tx.linkedTransferId) {
      try {
        const linked = await firstValueFrom(this.api.getLinkedTransfer(tx.id));
        this.inboxLinkedTransfer.set(linked);
      } catch {
        this.inboxLinkedTransfer.set(null);
      }
    }
  }

  skipTransaction() {
    this.nextTransaction();
  }

  saveAndNext(tx: Transaction) {
    // Save pending changes then mark as reviewed
    const categoryToSave = this.pendingCategory();
    const tagsToSave = this.pendingTags();

    const processing = new Set(this.processingIds());
    processing.add(tx.id);
    this.processingIds.set(processing);

    // Build update object
    const update: {
      category?: string | null;
      tags?: string[];
      isReviewed: boolean;
    } = {
      isReviewed: true,
    };

    if (categoryToSave !== null) {
      update.category = categoryToSave;
    }
    if (tagsToSave.length > 0 || tx.tags.length > 0) {
      update.tags = tagsToSave;
    }

    this.api.updateTransaction(tx.id, update).subscribe({
      next: (updated) => {
        this.updateTransactionInList(updated);
        this.removeFromProcessing(tx.id);
        // Remove from list and move to next
        this.transactions.update((txs) => txs.filter((t) => t.id !== tx.id));
        // Adjust index if needed
        if (this.currentIndex() >= this.transactions().length) {
          this.currentIndex.set(Math.max(0, this.transactions().length - 1));
        }
        this.resetPendingChanges();
        this.snackBar.open('Transaction saved', 'Dismiss', { duration: 2000 });
      },
      error: () => {
        this.snackBar.open('Failed to save transaction', 'Dismiss', {
          duration: 3000,
        });
        this.removeFromProcessing(tx.id);
      },
    });
  }

  // Category autocomplete
  filterCategories(value: string) {
    const filterValue = value.toLowerCase();
    this.filteredCategories.set(
      this.categories().filter((cat) =>
        cat.name.toLowerCase().includes(filterValue)
      )
    );
  }

  selectCategory(tx: Transaction, event: MatAutocompleteSelectedEvent) {
    const value = event.option.value;

    if (value.startsWith('__new__:')) {
      const newName = value.replace('__new__:', '');
      this.createCategoryAndSelect(newName);
    } else {
      // Store pending category NAME (API expects name, not ID)
      const cat = this.categories().find((c) => c.id === value);
      if (cat) {
        this.pendingCategory.set(cat.name);
        this.categoryInput.set(cat.name);
      }
    }
  }

  private createCategoryAndSelect(name: string) {
    this.api.createCategory({ name }).subscribe({
      next: (newCat) => {
        this.categories.update((cats) => [...cats, newCat]);
        this.filteredCategories.set(this.categories());
        this.pendingCategory.set(newCat.name); // Store name, not ID
        this.categoryInput.set(newCat.name);
      },
      error: () => {
        this.snackBar.open('Failed to create category', 'Dismiss', {
          duration: 3000,
        });
      },
    });
  }

  private createAndAssignCategory(tx: Transaction, name: string) {
    const processing = new Set(this.processingIds());
    processing.add(tx.id);
    this.processingIds.set(processing);

    this.api.createCategory({ name }).subscribe({
      next: (newCat) => {
        this.categories.update((cats) => [...cats, newCat]);
        this.filteredCategories.set(this.categories());
        this.updateCategory(tx, newCat.id);
      },
      error: () => {
        this.snackBar.open('Failed to create category', 'Dismiss', {
          duration: 3000,
        });
        this.removeFromProcessing(tx.id);
      },
    });
  }

  formatCategoryName(category: string): string {
    if (!category) return '';
    return category
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  getCategoryName(categoryId: string | null): string {
    if (!categoryId) return 'No category';
    const cat = this.categories().find((c) => c.id === categoryId);
    return cat ? cat.name : 'Unknown';
  }

  // Tag autocomplete methods
  filterTags(value: string) {
    const filterValue = value.toLowerCase();
    // Filter out tags that are already selected (pendingTags contains names)
    const currentTags = this.pendingTags();
    this.filteredTags.set(
      this.tags().filter(
        (tag) =>
          tag.name.toLowerCase().includes(filterValue) &&
          !currentTags.includes(tag.name) // Compare by name
      )
    );
  }

  selectTag(tx: Transaction, event: MatAutocompleteSelectedEvent) {
    const value = event.option.value;

    if (value.startsWith('__new__:')) {
      const newName = value.replace('__new__:', '');
      this.createTagAndSelect(newName);
    } else {
      // Add tag NAME to pending tags (API expects names, not IDs)
      const tag = this.tags().find((t) => t.id === value);
      if (tag) {
        const currentTags = this.pendingTags();
        if (!currentTags.includes(tag.name)) {
          this.pendingTags.set([...currentTags, tag.name]);
        }
      }
    }
    this.tagInput.set('');
    this.filterTags(''); // Reset filter to show remaining tags
  }

  private createTagAndSelect(name: string) {
    this.api.createTag({ name }).subscribe({
      next: (newTag) => {
        this.tags.update((tags) => [...tags, newTag]);
        this.filteredTags.set(this.tags());
        // Add tag NAME to pending tags (API expects names)
        const currentTags = this.pendingTags();
        this.pendingTags.set([...currentTags, newTag.name]);
        this.tagInput.set('');
      },
      error: () => {
        this.snackBar.open('Failed to create tag', 'Dismiss', {
          duration: 3000,
        });
      },
    });
  }

  private createAndAssignTag(tx: Transaction, name: string) {
    const processing = new Set(this.processingIds());
    processing.add(tx.id);
    this.processingIds.set(processing);

    this.api.createTag({ name }).subscribe({
      next: (newTag) => {
        this.tags.update((tags) => [...tags, newTag]);
        this.filteredTags.set(this.tags());
        this.addTagToTransaction(tx, newTag.id);
      },
      error: () => {
        this.snackBar.open('Failed to create tag', 'Dismiss', {
          duration: 3000,
        });
        this.removeFromProcessing(tx.id);
      },
    });
  }

  private addTagToTransaction(tx: Transaction, tagId: string) {
    if (tx.tags.includes(tagId)) {
      return; // Already has this tag
    }
    const newTags = [...tx.tags, tagId];
    this.updateTags(tx, newTags);
  }

  removeTag(tx: Transaction, tagName: string) {
    // Remove from pending tags (local only, not saved until Save & Next)
    const currentTags = this.pendingTags();
    this.pendingTags.set(currentTags.filter((t) => t !== tagName));
  }

  // Since tx.tags contains names (not IDs), just return the name directly
  getTagName(tagName: string): string {
    return tagName;
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
