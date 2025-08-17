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
import {
  FormBuilder,
  FormControl,
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { injectFinanceStore } from '../../store/finance.provider';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-categories',
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
    MatTooltipModule,
    MatListModule,
    MatDividerModule,
  ],
  styleUrl: './categories.component.scss',
  template: `
    <div class="categories-container">
      <!-- Modern Header with Analytics -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <h1 class="page-title">
              <mat-icon>category</mat-icon>
              Categories
            </h1>
            <p class="page-subtitle">
              Organize and analyze your spending patterns with intelligent
              categorization
            </p>
          </div>
          <div class="controls-section">
            <div class="header-stats">
              <div class="stat-chip">
                <mat-icon>sell</mat-icon>
                <span>{{ financeStore.categories().length }} Categories</span>
              </div>
              <div class="stat-chip">
                <mat-icon>pie_chart</mat-icon>
                <span>{{ getCategorizedTransactions() }} Categorized</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Add Form -->
      <mat-card class="quick-add-card">
        <mat-card-content>
          <div class="quick-add-form">
            <mat-form-field appearance="outline" class="category-input">
              <mat-label>Add New Category</mat-label>
              <input
                matInput
                #categoryInput
                [formControl]="categoryControl"
                placeholder="e.g., Food & Dining, Transportation"
                (keydown.enter)="addCategory()"
              />
              <mat-icon matSuffix>category</mat-icon>
            </mat-form-field>
            <button
              mat-raised-button
              color="primary"
              (click)="addCategory()"
              [disabled]="!categoryControl.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
              Adding... } @else {
              <ng-container>
                <mat-icon>add</mat-icon>
                Add Category
              </ng-container>
              }
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Loading State -->
      @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="48"></mat-spinner>
        <h3>Loading Categories</h3>
        <p>Analyzing your spending patterns...</p>
      </div>
      } @else {

      <!-- Categories Analytics Grid -->
      <div class="analytics-grid">
        <!-- Category Usage Statistics -->
        <mat-card class="analytics-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>bar_chart</mat-icon>
              Usage Analytics
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (getCategoryStats().length > 0) {
            <div class="category-stats">
              @for (stat of getCategoryStats().slice(0, 5); track stat.category)
              {
              <div class="stat-item" [class]="getStatItemClass($index)">
                <div class="stat-rank">#{{ $index + 1 }}</div>
                <div class="stat-content">
                  <div class="stat-name">{{ stat.category }}</div>
                  <div class="stat-details">
                    <span class="transaction-count"
                      >{{ stat.count }} transactions</span
                    >
                    <span class="amount">{{
                      formatCurrency(stat.amount)
                    }}</span>
                  </div>
                  <div class="usage-bar">
                    <div
                      class="usage-fill"
                      [style.width.%]="getUsagePercentage(stat.count)"
                    ></div>
                  </div>
                </div>
              </div>
              }
            </div>
            } @else {
            <div class="empty-analytics">
              <mat-icon>bar_chart</mat-icon>
              <p>No usage data available</p>
            </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Quick Add Suggestions -->
        <mat-card class="suggestions-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>lightbulb</mat-icon>
              Suggested Categories
            </mat-card-title>
            <mat-card-subtitle
              >Popular categories to get you started</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            <div class="suggestions-grid">
              @for (suggestion of getFilteredSuggestions(); track
              suggestion.name) {
              <button
                mat-stroked-button
                (click)="addSuggestedCategory(suggestion.name)"
                [disabled]="
                  financeStore.categories().includes(suggestion.name) ||
                  submitting()
                "
                class="suggestion-chip"
              >
                <mat-icon>{{ suggestion.icon }}</mat-icon>
                <span>{{ suggestion.name }}</span>
              </button>
              }
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Categories Management -->
      @if (financeStore.categories().length === 0) {
      <mat-card class="empty-state-card">
        <mat-card-content>
          <div class="empty-state">
            <div class="empty-icon">
              <mat-icon>category</mat-icon>
            </div>
            <h3>No Categories Yet</h3>
            <p>
              Start organizing your transactions by creating your first category
              above.
            </p>
            <div class="empty-actions">
              <button
                mat-raised-button
                color="primary"
                (click)="focusInput()"
                class="get-started-button"
              >
                <mat-icon>rocket_launch</mat-icon>
                Get Started
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
      } @else {
      <mat-card class="categories-list-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>list</mat-icon>
            All Categories
          </mat-card-title>
          <mat-card-subtitle>
            Manage your {{ financeStore.categories().length }} categories
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="categories-grid">
            @for (category of financeStore.categories(); track category) {
            <div class="category-item" [class]="getCategoryItemClass(category)">
              <div class="category-header">
                <div class="category-icon">
                  <mat-icon>{{ getCategoryIcon(category) }}</mat-icon>
                </div>
                <div class="category-info">
                  <h4 class="category-name">{{ category }}</h4>
                  <p class="category-meta">
                    {{ getCategoryUsage(category) }} transactions
                    <span class="category-amount">{{
                      getCategoryAmount(category)
                    }}</span>
                  </p>
                </div>
                <div class="category-actions">
                  <button
                    mat-icon-button
                    (click)="deleteCategory(category)"
                    [disabled]="deleting().has(category)"
                    class="delete-button"
                    matTooltip="Delete category"
                  >
                    @if (deleting().has(category)) {
                    <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                    <mat-icon>delete</mat-icon>
                    }
                  </button>
                </div>
              </div>
              <div class="category-stats">
                <div class="usage-indicator">
                  <div
                    class="usage-bar"
                    [style.width.%]="getCategoryUsagePercentage(category)"
                  ></div>
                </div>
              </div>
            </div>
            }
          </div>
        </mat-card-content>
      </mat-card>
      } }
    </div>
  `,
})
export class CategoriesComponent implements OnInit {
  readonly financeStore = injectFinanceStore();
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());

  @ViewChild('categoryInput') categoryInput!: ElementRef<HTMLInputElement>;

  categoryControl = new FormControl('', [
    Validators.required,
    Validators.minLength(2),
  ]);

  categoryForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  categorySuggestions = [
    { name: 'Food & Dining', icon: 'fa-utensils' },
    { name: 'Transportation', icon: 'fa-car' },
    { name: 'Shopping', icon: 'fa-shopping-bag' },
    { name: 'Entertainment', icon: 'fa-film' },
    { name: 'Bills & Utilities', icon: 'fa-file-invoice-dollar' },
    { name: 'Healthcare', icon: 'fa-heartbeat' },
    { name: 'Travel', icon: 'fa-plane' },
    { name: 'Education', icon: 'fa-graduation-cap' },
    { name: 'Personal Care', icon: 'fa-user' },
    { name: 'Home & Garden', icon: 'fa-home' },
    { name: 'Insurance', icon: 'fa-shield-alt' },
    { name: 'Gifts & Donations', icon: 'fa-gift' },
    { name: 'Business', icon: 'fa-briefcase' },
    { name: 'Investment', icon: 'fa-chart-line' },
    { name: 'Salary', icon: 'fa-money-bill-wave' },
    { name: 'Freelance', icon: 'fa-laptop' },
    { name: 'Rental Income', icon: 'fa-key' },
    { name: 'Other Income', icon: 'fa-plus-circle' },
  ];

  commonCategories = [
    'Food & Dining',
    'Transportation',
    'Shopping',
    'Entertainment',
    'Bills & Utilities',
    'Healthcare',
    'Travel',
    'Education',
    'Personal Care',
    'Home & Garden',
    'Insurance',
    'Gifts & Donations',
    'Business',
    'Investment',
    'Salary',
    'Freelance',
    'Rental Income',
    'Other Income',
  ];

  ngOnInit() {
    // Load data if not already loaded
    if (!this.financeStore.initialLoadComplete()) {
      this.financeStore.loadAllData();
    }
    this.loading.set(false);
  }

  addCategory() {
    if (!this.categoryControl.valid) return;

    this.submitting.set(true);
    const categoryName = this.categoryControl.value?.trim();

    if (categoryName) {
      this.financeStore.createCategory(categoryName);
      this.categoryControl.reset();
    }
    this.submitting.set(false);
  }

  addSuggestedCategory(categoryName: string) {
    this.submitting.set(true);
    this.financeStore.createCategory(categoryName);
    this.submitting.set(false);
  }

  async deleteCategory(categoryName: string) {
    const confirmed = await firstValueFrom(
      this.dialogService.confirm(
        `Are you sure you want to delete the category "${categoryName}"?`,
        'Delete Category',
        'Delete',
        'Cancel'
      )
    );

    if (!confirmed) return;

    // Add to deleting set
    const newDeleting = new Set(this.deleting());
    newDeleting.add(categoryName);
    this.deleting.set(newDeleting);

    this.financeStore.deleteCategory(categoryName);

    // Remove from deleting set
    const updatedDeleting = new Set(this.deleting());
    updatedDeleting.delete(categoryName);
    this.deleting.set(updatedDeleting);
  }

  // New analytics methods
  getCategorizedTransactions(): number {
    return this.financeStore
      .transactions()
      .filter((t) => t.category && t.category.trim() !== '').length;
  }

  getCategoryStats() {
    const transactions = this.financeStore.transactions();
    const categoryMap = new Map<string, { count: number; amount: number }>();

    transactions.forEach((transaction) => {
      if (transaction.category) {
        const existing = categoryMap.get(transaction.category) || {
          count: 0,
          amount: 0,
        };
        categoryMap.set(transaction.category, {
          count: existing.count + 1,
          amount: existing.amount + Math.abs(transaction.amount),
        });
      }
    });

    return Array.from(categoryMap.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.count - a.count);
  }

  getStatItemClass(index: number): string {
    const classes = ['stat-item'];
    if (index === 0) classes.push('top-category');
    if (index < 3) classes.push('high-usage');
    return classes.join(' ');
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  getUsagePercentage(count: number): number {
    const stats = this.getCategoryStats();
    const maxCount = stats.length > 0 ? stats[0].count : 1;
    return maxCount > 0 ? (count / maxCount) * 100 : 0;
  }

  getFilteredSuggestions() {
    return this.categorySuggestions.filter(
      (suggestion) => !this.financeStore.categories().includes(suggestion.name)
    );
  }

  focusInput() {
    if (this.categoryInput) {
      this.categoryInput.nativeElement.focus();
    }
  }

  getCategoryItemClass(category: string): string {
    const usage = this.getCategoryUsage(category);
    const classes = ['category-item'];

    if (usage === 0) classes.push('unused');
    else if (usage < 5) classes.push('low-usage');
    else if (usage < 20) classes.push('medium-usage');
    else classes.push('high-usage');

    return classes.join(' ');
  }

  getCategoryIcon(category: string): string {
    const suggestion = this.categorySuggestions.find(
      (s) => s.name === category
    );
    return suggestion?.icon || 'fa-tag';
  }

  getCategoryUsage(category: string): number {
    return this.financeStore
      .transactions()
      .filter((t) => t.category === category).length;
  }

  getCategoryAmount(category: string): string {
    const amount = this.financeStore
      .transactions()
      .filter((t) => t.category === category)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return this.formatCurrency(amount);
  }

  getCategoryUsagePercentage(category: string): number {
    const usage = this.getCategoryUsage(category);
    const maxUsage = Math.max(
      ...this.financeStore.categories().map((c) => this.getCategoryUsage(c)),
      1
    );
    return (usage / maxUsage) * 100;
  }
}
