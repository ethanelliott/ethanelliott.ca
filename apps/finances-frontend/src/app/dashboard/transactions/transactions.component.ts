import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import {
  FinanceApiService,
  Transaction,
  Account,
  Category,
  Tag,
  TransactionType,
  TransactionFilters,
  TransferSuggestion,
} from '../../services/finance-api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-transactions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatPaginatorModule,
    MatMenuModule,
    MatDividerModule,
    MatSnackBarModule,
    MatAutocompleteModule,
  ],
  styleUrl: './transactions.component.scss',
  template: `
    <div class="transactions-container">
      <div class="page-content">
        <!-- Search & Filters -->
        <div class="filters-section">
          <div class="search-row">
            @if (stats()?.unreviewedCount) {
            <button
              mat-flat-button
              color="accent"
              routerLink="/dashboard/inbox"
              class="review-btn"
            >
              <mat-icon>inbox</mat-icon>
              <span>{{ stats()!.unreviewedCount }} to review</span>
            </button>
            }
            <div class="search-wrapper">
              <mat-icon class="search-icon">search</mat-icon>
              <input
                type="text"
                class="search-input"
                placeholder="Search transactions..."
                [(ngModel)]="searchQuery"
                (input)="applyFilters()"
              />
              @if (searchQuery) {
              <button
                mat-icon-button
                class="clear-search"
                (click)="searchQuery = ''; applyFilters()"
              >
                <mat-icon>close</mat-icon>
              </button>
              }
            </div>
            <button
              mat-stroked-button
              class="filter-toggle"
              [class.active]="showFilters()"
              (click)="showFilters.set(!showFilters())"
            >
              <mat-icon>tune</mat-icon>
              <span>Filters</span>
              @if (activeFilterCount() > 0) {
              <span class="filter-badge">{{ activeFilterCount() }}</span>
              }
            </button>
          </div>

          @if (showFilters()) {
          <div class="filters-panel">
            <div class="filters-grid">
              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Account</mat-label>
                <mat-select
                  [(ngModel)]="selectedAccountId"
                  (selectionChange)="applyFilters()"
                >
                  <mat-option [value]="null">All Accounts</mat-option>
                  @for (account of accounts(); track account.id) {
                  <mat-option [value]="account.id">{{
                    account.name
                  }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Category</mat-label>
                <mat-select
                  [(ngModel)]="selectedCategoryId"
                  (selectionChange)="applyFilters()"
                >
                  <mat-option [value]="null">All Categories</mat-option>
                  @for (category of categories(); track category.id) {
                  <mat-option [value]="category.id">{{
                    category.name
                  }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Type</mat-label>
                <mat-select
                  [(ngModel)]="selectedType"
                  (selectionChange)="applyFilters()"
                >
                  <mat-option [value]="null">All Types</mat-option>
                  <mat-option [value]="TransactionType.INCOME"
                    >Income</mat-option
                  >
                  <mat-option [value]="TransactionType.EXPENSE"
                    >Expense</mat-option
                  >
                  <mat-option [value]="TransactionType.TRANSFER"
                    >Transfer</mat-option
                  >
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Start Date</mat-label>
                <input
                  matInput
                  [matDatepicker]="startPicker"
                  [(ngModel)]="startDate"
                  (dateChange)="applyFilters()"
                />
                <mat-datepicker-toggle
                  matIconSuffix
                  [for]="startPicker"
                ></mat-datepicker-toggle>
                <mat-datepicker #startPicker></mat-datepicker>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>End Date</mat-label>
                <input
                  matInput
                  [matDatepicker]="endPicker"
                  [(ngModel)]="endDate"
                  (dateChange)="applyFilters()"
                />
                <mat-datepicker-toggle
                  matIconSuffix
                  [for]="endPicker"
                ></mat-datepicker-toggle>
                <mat-datepicker #endPicker></mat-datepicker>
              </mat-form-field>
            </div>

            @if (hasActiveFilters()) {
            <button
              mat-button
              class="clear-filters-btn"
              (click)="clearFilters()"
            >
              <mat-icon>clear_all</mat-icon>
              Clear all filters
            </button>
            }
          </div>
          }
        </div>

        <!-- Edit Panel -->
        @if (editingTransaction()) {
        <div class="edit-panel">
          <div class="edit-panel-header">
            <div class="edit-tx-info">
              <span class="edit-tx-date">{{
                editingTransaction()!.date | date : 'MMM d, yyyy'
              }}</span>
              <span class="edit-tx-name">{{
                editingTransaction()!.merchantName || editingTransaction()!.name
              }}</span>
              <span
                class="edit-tx-amount"
                [class]="getAmountClass(editingTransaction()!)"
              >
                {{ formatAmount(editingTransaction()!) }}
              </span>
            </div>
            <button mat-icon-button (click)="cancelEdit()">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="edit-panel-content">
            <!-- Transfer Info Card -->
            @if (linkedTransfer()) {
            <div class="transfer-card">
              <div class="transfer-card-header">
                <mat-icon>swap_horiz</mat-icon>
                <span>Linked Transfer</span>
                @if (editingTransaction()?.linkedTransferConfidence) {
                <span class="confidence-badge"
                  >{{ editingTransaction()!.linkedTransferConfidence }}%
                  confidence</span
                >
                }
              </div>
              <div class="transfer-card-body">
                <div class="transfer-detail">
                  <span class="transfer-label">Account</span>
                  <span>{{ linkedTransfer()!.accountName }}</span>
                </div>
                <div class="transfer-detail">
                  <span class="transfer-label">Date</span>
                  <span>{{ linkedTransfer()!.date }}</span>
                </div>
                <div class="transfer-detail">
                  <span class="transfer-label">Amount</span>
                  <span>{{ formatAmount(linkedTransfer()!) }}</span>
                </div>
                <div class="transfer-detail">
                  <span class="transfer-label">Name</span>
                  <span>{{
                    linkedTransfer()!.merchantName || linkedTransfer()!.name
                  }}</span>
                </div>
              </div>
              <button
                mat-stroked-button
                class="unlink-btn"
                (click)="unlinkTransfer(editingTransaction()!)"
              >
                <mat-icon>link_off</mat-icon>
                Unlink
              </button>
            </div>
            } @else if (transferSuggestions().length > 0) {
            <div class="transfer-suggestions">
              <div class="transfer-suggestions-header">
                <mat-icon>lightbulb</mat-icon>
                <span>Transfer Suggestions</span>
              </div>
              @for (suggestion of transferSuggestions(); track suggestion.id) {
              <div class="suggestion-row">
                <div class="suggestion-info">
                  <span class="suggestion-name">{{
                    suggestion.merchantName || suggestion.name
                  }}</span>
                  <span class="suggestion-meta"
                    >{{ suggestion.accountName }} · {{ suggestion.date }}</span
                  >
                </div>
                <span class="suggestion-amount">{{
                  formatAmount(suggestion)
                }}</span>
                <span class="confidence-badge"
                  >{{ suggestion.confidence }}%</span
                >
                <button
                  mat-icon-button
                  (click)="linkTransfer(editingTransaction()!, suggestion)"
                  matTooltip="Link as transfer"
                >
                  <mat-icon>link</mat-icon>
                </button>
              </div>
              }
            </div>
            } @else if (!editingTransaction()?.linkedTransferId &&
            loadingTransferInfo()) {
            <div class="transfer-loading">
              <mat-spinner diameter="20"></mat-spinner>
              <span>Looking for matching transfers...</span>
            </div>
            }

            <mat-form-field appearance="outline" class="edit-field">
              <mat-label>Category</mat-label>
              <input
                matInput
                [matAutocomplete]="categoryAuto"
                [(ngModel)]="categoryInput"
                (ngModelChange)="filterCategories($event)"
                placeholder="Search or create category..."
              />
              <mat-autocomplete
                #categoryAuto="matAutocomplete"
                (optionSelected)="selectCategory($event)"
              >
                @if (categoryInput() && !categoryExists()) {
                <mat-option [value]="'__new__:' + categoryInput()">
                  <mat-icon>add</mat-icon> Create "{{ categoryInput() }}"
                </mat-option>
                } @for (cat of filteredCategories(); track cat.id) {
                <mat-option [value]="cat.name">{{ cat.name }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>

            <mat-form-field appearance="outline" class="edit-field">
              <mat-label>Tags</mat-label>
              <mat-chip-grid #chipGrid aria-label="Tag selection">
                @for (tagId of editingTransactionTags(); track tagId) {
                <mat-chip-row (removed)="removeTagFromEditing(tagId)">
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
                (optionSelected)="selectTag($event); tagInputRef.value = ''"
              >
                @if (tagInput() && !tagExists()) {
                <mat-option [value]="'__new__:' + tagInput()">
                  <mat-icon>add</mat-icon> Create "{{ tagInput() }}"
                </mat-option>
                } @for (tag of filteredTags(); track tag.id) {
                <mat-option [value]="tag.name">{{ tag.name }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
          </div>
          <div class="edit-panel-actions">
            <button mat-stroked-button (click)="cancelEdit()">Cancel</button>
            <button
              mat-flat-button
              color="primary"
              (click)="saveEdit()"
              [disabled]="saving()"
            >
              @if (saving()) {
              <mat-spinner diameter="18"></mat-spinner>
              } @else {
              <mat-icon>check</mat-icon>
              Save Changes }
            </button>
          </div>
        </div>
        }

        <!-- Transactions List -->
        <div class="transactions-section">
          @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Loading transactions...</p>
          </div>
          } @else if (paginatedTransactions().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">
              <mat-icon>receipt_long</mat-icon>
            </div>
            <h3>No transactions found</h3>
            <p>
              @if (hasActiveFilters()) { No transactions match your current
              filters } @else { Connect a bank account to start seeing your
              transactions }
            </p>
            @if (hasActiveFilters()) {
            <button mat-flat-button color="primary" (click)="clearFilters()">
              Clear Filters
            </button>
            } @else {
            <button
              mat-flat-button
              color="primary"
              routerLink="/dashboard/accounts"
            >
              Connect Bank Account
            </button>
            }
          </div>
          } @else {
          <div class="transactions-list">
            @for (tx of paginatedTransactions(); track tx.id) {
            <div
              class="transaction-row"
              [class.pending]="tx.pending"
              [class.transfer]="tx.type === TransactionType.TRANSFER"
              [class.editing]="editingTransaction()?.id === tx.id"
              [class.unreviewed]="!tx.isReviewed"
            >
              <div class="tx-main" (click)="startEdit(tx)">
                <div class="tx-date">
                  <span class="date-day">{{ formatDay(tx.date) }}</span>
                  <span class="date-month">{{ formatMonth(tx.date) }}</span>
                </div>
                <div class="tx-icon" [class]="getTypeClass(tx)">
                  <mat-icon>{{ getTypeIcon(tx) }}</mat-icon>
                </div>
                <div class="tx-details">
                  <div class="tx-name-row">
                    <span class="tx-name">{{
                      tx.merchantName || tx.name
                    }}</span>
                    @if (tx.pending) {
                    <span class="pending-badge">Pending</span>
                    } @if (!tx.isReviewed) {
                    <span class="new-badge">New</span>
                    }
                  </div>
                  <div class="tx-meta">
                    <span class="tx-account">{{ tx.accountName }}</span>
                    @if (tx.category) {
                    <span
                      class="tx-category"
                      [style.background-color]="tx.categoryColor || '#666'"
                    >
                      {{ getCategoryName(tx.category) }}
                    </span>
                    } @else {
                    <span class="tx-category uncategorized">Uncategorized</span>
                    } @if (tx.tags && tx.tags.length > 0) { @for (tagId of
                    tx.tags.slice(0, 2); track tagId) {
                    <span class="tx-tag">{{ getTagName(tagId) }}</span>
                    } @if (tx.tags.length > 2) {
                    <span class="tx-tag-more">+{{ tx.tags.length - 2 }}</span>
                    } }
                  </div>
                </div>
                <div class="tx-amount" [class]="getAmountClass(tx)">
                  {{ formatAmount(tx) }}
                </div>
              </div>
              <div class="tx-actions">
                <button
                  mat-icon-button
                  [matMenuTriggerFor]="txMenu"
                  (click)="$event.stopPropagation()"
                >
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #txMenu="matMenu">
                  <button mat-menu-item (click)="startEdit(tx)">
                    <mat-icon>edit</mat-icon>
                    <span>Edit</span>
                  </button>
                  @if (tx.linkedTransferId) {
                  <button mat-menu-item (click)="viewLinkedTransfer(tx)">
                    <mat-icon>swap_horiz</mat-icon>
                    <span>View Transfer</span>
                  </button>
                  <button mat-menu-item (click)="unlinkTransfer(tx)">
                    <mat-icon>link_off</mat-icon>
                    <span>Unlink Transfer</span>
                  </button>
                  } @else {
                  <button mat-menu-item (click)="showTransferSuggestions(tx)">
                    <mat-icon>swap_horiz</mat-icon>
                    <span>Link as Transfer</span>
                  </button>
                  }
                </mat-menu>
              </div>
            </div>
            }
          </div>

          <div class="pagination-wrapper">
            <mat-paginator
              [length]="filteredTransactions().length"
              [pageSize]="pageSize"
              [pageSizeOptions]="[25, 50, 100]"
              [pageIndex]="pageIndex"
              (page)="onPageChange($event)"
              showFirstLastButtons
            ></mat-paginator>
          </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class TransactionsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);

  readonly TransactionType = TransactionType;

  loading = signal(true);
  saving = signal(false);
  transactions = signal<Transaction[]>([]);
  accounts = signal<Account[]>([]);
  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);
  stats = signal<{
    totalIncome: number;
    totalExpenses: number;
    unreviewedCount: number;
  } | null>(null);

  // UI State
  showFilters = signal(false);
  editingTransaction = signal<Transaction | null>(null);
  editingTransactionTags = signal<string[]>([]);
  linkedTransfer = signal<Transaction | null>(null);
  transferSuggestions = signal<TransferSuggestion[]>([]);
  loadingTransferInfo = signal(false);

  // Filter state
  searchQuery = '';
  selectedAccountId: string | null = null;
  selectedCategoryId: string | null = null;
  selectedTagFilter: string | null = null;
  selectedType: TransactionType | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;

  // Category/Tag editing
  categoryInput = signal('');
  tagInput = signal('');
  filteredCategories = signal<Category[]>([]);
  filteredTags = signal<Tag[]>([]);

  // Pagination
  pageIndex = 0;
  pageSize = 50;

  // Computed filtered transactions
  filteredTransactions = signal<Transaction[]>([]);

  paginatedTransactions = computed(() => {
    const filtered = this.filteredTransactions();
    const start = this.pageIndex * this.pageSize;
    return filtered.slice(start, start + this.pageSize);
  });

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.selectedAccountId) count++;
    if (this.selectedCategoryId) count++;
    if (this.selectedTagFilter) count++;
    if (this.selectedType) count++;
    if (this.startDate) count++;
    if (this.endDate) count++;
    return count;
  });

  categoryExists = computed(() => {
    const input = this.categoryInput().toLowerCase();
    return this.categories().some((c) => c.name.toLowerCase() === input);
  });

  tagExists = computed(() => {
    const input = this.tagInput().toLowerCase();
    return this.tags().some((t) => t.name.toLowerCase() === input);
  });

  ngOnInit() {
    // Read query params and apply as filters
    this.route.queryParams.subscribe((params) => {
      if (params['accountId']) {
        this.selectedAccountId = params['accountId'];
        this.showFilters.set(true);
      }
      if (params['categoryId']) {
        this.selectedCategoryId = params['categoryId'];
        this.showFilters.set(true);
      }
      // Also support filtering by category name
      if (params['category']) {
        this.selectedCategoryId = params['category'];
        this.showFilters.set(true);
      }
      // Support filtering by tag name
      if (params['tag']) {
        this.selectedTagFilter = params['tag'];
        this.showFilters.set(true);
      }
      if (params['type']) {
        this.selectedType = params['type'] as TransactionType;
        this.showFilters.set(true);
      }
      if (params['search']) {
        this.searchQuery = params['search'];
      }
      if (params['startDate']) {
        this.startDate = new Date(params['startDate']);
        this.showFilters.set(true);
      }
      if (params['endDate']) {
        this.endDate = new Date(params['endDate']);
        this.showFilters.set(true);
      }

      // Apply filters after data is loaded
      if (this.transactions().length > 0) {
        this.applyFilters();
      }
    });

    this.loadData();
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const [transactions, accounts, categories, tags, stats] =
        await Promise.all([
          firstValueFrom(this.apiService.getAllTransactions()),
          firstValueFrom(this.apiService.getAllAccounts()),
          firstValueFrom(this.apiService.getAllCategories()),
          firstValueFrom(this.apiService.getAllTags()),
          firstValueFrom(this.apiService.getTransactionStats()),
        ]);
      this.transactions.set(transactions);
      this.filteredTransactions.set(transactions);
      this.accounts.set(accounts);
      this.categories.set(categories);
      this.filteredCategories.set(categories);
      this.tags.set(tags);
      this.filteredTags.set(tags);
      this.stats.set({
        totalIncome: stats.totalIncome,
        totalExpenses: stats.totalExpenses,
        unreviewedCount: stats.unreviewedCount,
      });

      // Apply any filters from query params
      this.applyFilters();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilters() {
    let filtered = this.transactions();

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tx) =>
          tx.name.toLowerCase().includes(query) ||
          (tx.merchantName && tx.merchantName.toLowerCase().includes(query)) ||
          (tx.notes && tx.notes.toLowerCase().includes(query))
      );
    }

    if (this.selectedAccountId) {
      filtered = filtered.filter(
        (tx) => tx.accountId === this.selectedAccountId
      );
    }

    if (this.selectedCategoryId) {
      filtered = filtered.filter(
        (tx) => tx.category === this.selectedCategoryId
      );
    }

    if (this.selectedTagFilter) {
      filtered = filtered.filter(
        (tx) => tx.tags && tx.tags.includes(this.selectedTagFilter!)
      );
    }

    if (this.selectedType) {
      filtered = filtered.filter((tx) => tx.type === this.selectedType);
    }

    if (this.startDate) {
      const start = this.startDate.toISOString().split('T')[0];
      filtered = filtered.filter((tx) => tx.date >= start);
    }

    if (this.endDate) {
      const end = this.endDate.toISOString().split('T')[0];
      filtered = filtered.filter((tx) => tx.date <= end);
    }

    this.filteredTransactions.set(filtered);
    this.pageIndex = 0;
  }

  hasActiveFilters(): boolean {
    return !!(
      this.searchQuery ||
      this.selectedAccountId ||
      this.selectedCategoryId ||
      this.selectedTagFilter ||
      this.selectedType ||
      this.startDate ||
      this.endDate
    );
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedAccountId = null;
    this.selectedCategoryId = null;
    this.selectedTagFilter = null;
    this.selectedType = null;
    this.startDate = null;
    this.endDate = null;
    this.filteredTransactions.set(this.transactions());
    this.pageIndex = 0;
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  // Edit functionality
  startEdit(tx: Transaction) {
    this.editingTransaction.set(tx);
    // tx.tags already contains tag names, not IDs
    this.editingTransactionTags.set(tx.tags ? [...tx.tags] : []);
    // tx.category is already the category name, not an ID
    this.categoryInput.set(tx.category ?? '');
    this.tagInput.set('');
    this.filteredCategories.set(this.categories());
    // Filter out tags that are already on the transaction (by name)
    this.filteredTags.set(
      this.tags().filter((t) => !tx.tags?.includes(t.name))
    );

    // Load transfer info
    this.linkedTransfer.set(null);
    this.transferSuggestions.set([]);
    this.loadTransferInfo(tx);
  }

  cancelEdit() {
    this.editingTransaction.set(null);
    this.editingTransactionTags.set([]);
    this.categoryInput.set('');
    this.tagInput.set('');
    this.linkedTransfer.set(null);
    this.transferSuggestions.set([]);
    this.loadingTransferInfo.set(false);
  }

  async saveEdit() {
    const tx = this.editingTransaction();
    if (!tx) return;

    try {
      this.saving.set(true);

      // Get category name from input (API expects names, not IDs)
      const categoryName = this.categoryInput().trim() || null;
      // Tags are already stored as names
      const tagNames = this.editingTransactionTags();

      // Update transaction - API expects category name and tag names
      await firstValueFrom(
        this.apiService.updateTransaction(tx.id, {
          category: categoryName,
          tags: tagNames,
          isReviewed: true,
        })
      );

      // Update local state
      const updated = this.transactions().map((t) => {
        if (t.id === tx.id) {
          return {
            ...t,
            category: categoryName,
            tags: tagNames,
            isReviewed: true,
          } as Transaction;
        }
        return t;
      });
      this.transactions.set(updated);
      this.applyFilters();

      this.snackBar.open('Transaction updated', 'Dismiss', { duration: 3000 });
      this.cancelEdit();
    } catch (error) {
      console.error('Error saving transaction:', error);
      this.snackBar.open('Error saving transaction', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  // Category autocomplete
  filterCategories(query: string) {
    this.categoryInput.set(query);
    if (!query) {
      this.filteredCategories.set(this.categories());
      return;
    }
    const lowerQuery = query.toLowerCase();
    this.filteredCategories.set(
      this.categories().filter((c) => c.name.toLowerCase().includes(lowerQuery))
    );
  }

  async selectCategory(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value;

    if (value.startsWith('__new__:')) {
      // Create new category
      const name = value.replace('__new__:', '');
      try {
        const newCategory = await firstValueFrom(
          this.apiService.createCategory({ name, color: this.getRandomColor() })
        );
        this.categories.set([...this.categories(), newCategory]);
        // Set the category name (not ID)
        this.categoryInput.set(name);
      } catch (error) {
        console.error('Error creating category:', error);
        this.snackBar.open('Error creating category', 'Dismiss', {
          duration: 3000,
        });
      }
    } else {
      // value is the category name from the autocomplete
      this.categoryInput.set(value);
    }
  }

  // Tag autocomplete
  filterTags(query: string) {
    this.tagInput.set(query);
    // currentTags contains tag names, not IDs
    const currentTagNames = this.editingTransactionTags();
    if (!query) {
      this.filteredTags.set(
        this.tags().filter((t) => !currentTagNames.includes(t.name))
      );
      return;
    }
    const lowerQuery = query.toLowerCase();
    this.filteredTags.set(
      this.tags().filter(
        (t) =>
          t.name.toLowerCase().includes(lowerQuery) &&
          !currentTagNames.includes(t.name)
      )
    );
  }

  async selectTag(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value;

    if (value.startsWith('__new__:')) {
      // Create new tag
      const name = value.replace('__new__:', '');
      try {
        const newTag = await firstValueFrom(
          this.apiService.createTag({ name })
        );
        this.tags.set([...this.tags(), newTag]);
        // Add the tag name, not the ID
        this.editingTransactionTags.set([
          ...this.editingTransactionTags(),
          name,
        ]);
      } catch (error) {
        console.error('Error creating tag:', error);
        this.snackBar.open('Error creating tag', 'Dismiss', { duration: 3000 });
      }
    } else {
      // value is the tag name from the autocomplete
      this.editingTransactionTags.set([
        ...this.editingTransactionTags(),
        value,
      ]);
    }
    this.tagInput.set('');
    this.filterTags('');
  }

  removeTagFromEditing(tagName: string) {
    this.editingTransactionTags.set(
      this.editingTransactionTags().filter((name) => name !== tagName)
    );
    this.filterTags(this.tagInput());
  }

  private getRandomColor(): string {
    const colors = [
      '#ef4444',
      '#f97316',
      '#f59e0b',
      '#eab308',
      '#84cc16',
      '#22c55e',
      '#10b981',
      '#14b8a6',
      '#06b6d4',
      '#0ea5e9',
      '#3b82f6',
      '#6366f1',
      '#8b5cf6',
      '#a855f7',
      '#d946ef',
      '#ec4899',
      '#f43f5e',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // tx.category is already the category name from the API
  getCategoryName(categoryName: string): string {
    return categoryName || 'Unknown';
  }

  // tx.tags already contains tag names from the API
  getTagName(tagName: string): string {
    return tagName || 'Unknown';
  }

  getTypeClass(tx: Transaction): string {
    switch (tx.type) {
      case TransactionType.INCOME:
        return 'income';
      case TransactionType.EXPENSE:
        return 'expense';
      case TransactionType.TRANSFER:
        return 'transfer';
      default:
        return '';
    }
  }

  getTypeIcon(tx: Transaction): string {
    switch (tx.type) {
      case TransactionType.INCOME:
        return 'arrow_downward';
      case TransactionType.EXPENSE:
        return 'arrow_upward';
      case TransactionType.TRANSFER:
        return 'swap_horiz';
      default:
        return 'receipt';
    }
  }

  getAmountClass(tx: Transaction): string {
    switch (tx.type) {
      case TransactionType.INCOME:
        return 'positive';
      case TransactionType.EXPENSE:
        return 'negative';
      case TransactionType.TRANSFER:
        return 'transfer-amount';
      default:
        return '';
    }
  }

  // ── Transfer linking ──

  private async loadTransferInfo(tx: Transaction) {
    this.loadingTransferInfo.set(true);
    try {
      if (tx.linkedTransferId) {
        const linked = await firstValueFrom(
          this.apiService.getLinkedTransfer(tx.id)
        );
        this.linkedTransfer.set(linked);
      } else {
        const suggestions = await firstValueFrom(
          this.apiService.getTransferSuggestions(tx.id)
        );
        this.transferSuggestions.set(suggestions);
      }
    } catch (error) {
      console.error('Error loading transfer info:', error);
    } finally {
      this.loadingTransferInfo.set(false);
    }
  }

  viewLinkedTransfer(tx: Transaction) {
    if (!tx.linkedTransferId) return;
    // Find the linked transaction in the list and scroll/open it
    const linked = this.transactions().find(
      (t) => t.id === tx.linkedTransferId
    );
    if (linked) {
      this.startEdit(linked);
    }
  }

  showTransferSuggestions(tx: Transaction) {
    this.startEdit(tx);
  }

  async linkTransfer(source: Transaction, target: Transaction) {
    try {
      this.saving.set(true);
      await firstValueFrom(this.apiService.linkTransfer(source.id, target.id));

      // Refresh local state
      await this.loadData();
      this.cancelEdit();
      this.snackBar.open('Transactions linked as transfer', 'Dismiss', {
        duration: 3000,
      });
    } catch (error) {
      console.error('Error linking transfer:', error);
      this.snackBar.open('Error linking transfer', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  async unlinkTransfer(tx: Transaction) {
    try {
      this.saving.set(true);
      await firstValueFrom(this.apiService.unlinkTransfer(tx.id));

      // Refresh local state
      await this.loadData();
      this.cancelEdit();
      this.snackBar.open('Transfer unlinked', 'Dismiss', {
        duration: 3000,
      });
    } catch (error) {
      console.error('Error unlinking transfer:', error);
      this.snackBar.open('Error unlinking transfer', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  formatAmount(tx: Transaction): string {
    const abs = Math.abs(tx.amount);
    const formatted = this.formatCurrency(abs);
    switch (tx.type) {
      case TransactionType.INCOME:
        return '+' + formatted;
      case TransactionType.EXPENSE:
        return '-' + formatted;
      case TransactionType.TRANSFER:
        return tx.amount > 0 ? '-' + formatted : '+' + formatted;
      default:
        return formatted;
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  }

  formatDay(dateStr: string): string {
    const date = new Date(dateStr);
    return date.getDate().toString();
  }

  formatMonth(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short' });
  }
}
