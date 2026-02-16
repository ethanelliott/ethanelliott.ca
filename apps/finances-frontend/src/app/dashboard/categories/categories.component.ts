import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  ElementRef,
  ViewChild,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import {
  FinanceApiService,
  Category,
  CategoryUsage,
} from '../../services/finance-api.service';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-categories',
  standalone: true,
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
    MatSnackBarModule,
  ],
  styleUrl: './categories.component.scss',
  template: `
    <div class="categories-container">
      <!-- Header -->
      <header class="header">
        <div class="header-row">
          <div class="title-section">
            <h1>Categories</h1>
            <p class="page-subtitle">Organize your transactions by category</p>
          </div>
          <div class="controls-section">
            <div class="search-box">
              <mat-icon>search</mat-icon>
              <input
                type="text"
                [formControl]="searchControl"
                placeholder="Search categories..."
              />
              @if (searchControl.value) {
              <button class="clear-btn" (click)="searchControl.reset()">
                <mat-icon>close</mat-icon>
              </button>
              }
            </div>
            <button
              mat-stroked-button
              (click)="seedDefaults()"
              [disabled]="seeding()"
              class="seed-btn"
            >
              @if (seeding()) {
              <mat-spinner diameter="18"></mat-spinner>
              } @else {
              <mat-icon>auto_awesome</mat-icon>
              Seed Defaults
              }
            </button>
          </div>
        </div>
      </header>

      <!-- Quick Add Form -->
      <div class="quick-add-section">
        <form class="quick-add-form" (ngSubmit)="addCategory()">
          <div class="color-picker-wrapper">
            <input
              type="color"
              [formControl]="colorControl"
              class="color-input"
              title="Choose category color"
            />
          </div>
          <mat-form-field appearance="outline" class="name-input">
            <mat-label>New category name</mat-label>
            <input
              matInput
              [formControl]="categoryControl"
              placeholder="e.g. Groceries, Transportation..."
              #categoryInput
            />
          </mat-form-field>
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="!categoryControl.valid || submitting()"
            class="add-button"
          >
            @if (submitting()) {
            <mat-spinner diameter="18"></mat-spinner>
            } @else {
            <mat-icon>add</mat-icon>
            Add
            }
          </button>
        </form>
      </div>

      @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="40"></mat-spinner>
        <span>Loading categories...</span>
      </div>
      } @else {
      <!-- Stats Bar -->
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-value">{{ categories().length }}</span>
          <span class="stat-label">Total Categories</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ getTotalTransactions() }}</span>
          <span class="stat-label">Categorized</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ getSystemCount() }}</span>
          <span class="stat-label">System</span>
        </div>
      </div>

      <!-- Categories Grid -->
      @if (filteredCategories().length === 0) {
      <div class="empty-state">
        @if (searchControl.value) {
        <mat-icon>search_off</mat-icon>
        <h3>No matches found</h3>
        <p>Try a different search term</p>
        } @else {
        <mat-icon>category</mat-icon>
        <h3>No Categories Yet</h3>
        <p>Add your first category or seed with defaults to get started</p>
        }
      </div>
      } @else {
      <div class="categories-grid">
        @for (category of filteredCategories(); track category.id) {
        <div
          class="category-card"
          [class.expanded]="expandedCategoryId() === category.id"
          [class.is-system]="category.isSystem"
        >
          <!-- Category Header (always visible) -->
          <div class="category-header" (click)="toggleExpand(category)">
            <div
              class="color-indicator"
              [style.background-color]="category.color || '#666'"
            ></div>
            <div class="category-info">
              <span class="category-name">{{ category.name }}</span>
              @if (getUsageCount(category.id); as count) {
              <span class="usage-count">{{ count }} transactions</span>
              }
            </div>
            @if (category.isSystem) {
            <span class="system-badge">System</span>
            }
            <mat-icon class="expand-icon">
              {{
                expandedCategoryId() === category.id
                  ? 'expand_less'
                  : 'expand_more'
              }}
            </mat-icon>
          </div>

          <!-- Expanded Content -->
          @if (expandedCategoryId() === category.id) {
          <div class="category-details">
            <div class="edit-section">
              <div class="edit-row">
                <label>Color</label>
                <div class="color-edit">
                  <input
                    type="color"
                    [value]="category.color || '#666666'"
                    (change)="updateColor(category, $event)"
                    class="edit-color-input"
                    [disabled]="category.isSystem"
                  />
                  <span class="color-hex">{{
                    category.color || '#666666'
                  }}</span>
                </div>
              </div>

              <div class="edit-row">
                <label>Name</label>
                <div class="name-edit">
                  @if (editingCategoryId() === category.id) {
                  <input
                    type="text"
                    [formControl]="editNameControl"
                    class="edit-name-input"
                    (keydown.enter)="saveEdit(category)"
                    (keydown.escape)="cancelEdit()"
                  />
                  <button
                    class="save-btn"
                    (click)="saveEdit(category)"
                    [disabled]="!editNameControl.valid"
                  >
                    <mat-icon>check</mat-icon>
                  </button>
                  <button class="cancel-btn" (click)="cancelEdit()">
                    <mat-icon>close</mat-icon>
                  </button>
                  } @else {
                  <span class="current-name">{{ category.name }}</span>
                  @if (!category.isSystem) {
                  <button
                    class="edit-btn"
                    (click)="editCategory(category); $event.stopPropagation()"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  }
                  }
                </div>
              </div>

              @if (category.description) {
              <div class="edit-row">
                <label>Description</label>
                <span class="description">{{ category.description }}</span>
              </div>
              }
            </div>

            <div class="action-buttons">
              <button
                mat-stroked-button
                (click)="viewTransactions(category)"
                class="view-btn"
              >
                <mat-icon>receipt_long</mat-icon>
                View Transactions
              </button>
              <button
                mat-stroked-button
                color="warn"
                (click)="deleteCategory(category)"
                [disabled]="deleting().has(category.id) || category.isSystem"
                class="delete-btn"
              >
                @if (deleting().has(category.id)) {
                <mat-spinner diameter="18"></mat-spinner>
                } @else {
                <mat-icon>delete</mat-icon>
                Delete
                }
              </button>
            </div>
          </div>
          }
        </div>
        }
      </div>
      }
      }
    </div>
  `,
})
export class CategoriesComponent implements OnInit {
  @ViewChild('categoryInput') categoryInput!: ElementRef<HTMLInputElement>;

  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);
  private readonly router = inject(Router);

  loading = signal(true);
  submitting = signal(false);
  seeding = signal(false);
  deleting = signal<Set<string>>(new Set());
  categories = signal<Category[]>([]);
  categoryUsage = signal<CategoryUsage[]>([]);
  expandedCategoryId = signal<string | null>(null);
  editingCategoryId = signal<string | null>(null);

  searchControl = new FormControl('');
  editNameControl = new FormControl('', [
    Validators.required,
    Validators.minLength(2),
  ]);
  categoryControl = new FormControl('', [
    Validators.required,
    Validators.minLength(2),
    Validators.maxLength(50),
  ]);
  colorControl = new FormControl('#6366f1');

  filteredCategories = computed(() => {
    const search = this.searchControl.value?.toLowerCase() || '';
    const cats = this.categories();
    if (!search) return cats;
    return cats.filter((c) => c.name.toLowerCase().includes(search));
  });

  ngOnInit() {
    this.loadData();
    this.searchControl.valueChanges.subscribe(() => {
      // Reset expanded state on search
      this.expandedCategoryId.set(null);
    });
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const [categories, usage] = await Promise.all([
        firstValueFrom(this.apiService.getAllCategories()),
        firstValueFrom(this.apiService.getCategoryUsage()),
      ]);
      this.categories.set(categories);
      this.categoryUsage.set(usage);
    } catch (error) {
      console.error('Error loading categories:', error);
      this.snackBar.open('Failed to load categories', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.loading.set(false);
    }
  }

  getTotalTransactions(): number {
    return this.categoryUsage().reduce((sum, u) => sum + u.transactionCount, 0);
  }

  getSystemCount(): number {
    return this.categories().filter((c) => c.isSystem).length;
  }

  getUsageCount(categoryId: string): number {
    return (
      this.categoryUsage().find((u) => u.categoryId === categoryId)
        ?.transactionCount || 0
    );
  }

  toggleExpand(category: Category) {
    if (this.expandedCategoryId() === category.id) {
      this.expandedCategoryId.set(null);
      this.cancelEdit();
    } else {
      this.expandedCategoryId.set(category.id);
      this.cancelEdit();
    }
  }

  async addCategory() {
    if (!this.categoryControl.valid) return;

    try {
      this.submitting.set(true);
      await firstValueFrom(
        this.apiService.createCategory({
          name: this.categoryControl.value!,
          color: this.colorControl.value || undefined,
        })
      );
      this.categoryControl.reset();
      this.loadData();
      this.snackBar.open('Category added', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error adding category:', error);
      this.snackBar.open('Failed to add category', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.submitting.set(false);
    }
  }

  async seedDefaults() {
    try {
      this.seeding.set(true);
      const result = await firstValueFrom(
        this.apiService.seedDefaultCategories()
      );
      this.loadData();
      this.snackBar.open(
        `${result.created} default categories added`,
        'Dismiss',
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Error seeding defaults:', error);
      this.snackBar.open('Failed to seed categories', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.seeding.set(false);
    }
  }

  async updateColor(category: Category, event: Event) {
    const input = event.target as HTMLInputElement;
    const newColor = input.value;

    if (newColor === category.color) return;

    try {
      await firstValueFrom(
        this.apiService.updateCategory(category.id, { color: newColor })
      );
      // Update local state immediately
      this.categories.update((cats) =>
        cats.map((c) => (c.id === category.id ? { ...c, color: newColor } : c))
      );
      this.snackBar.open('Color updated', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error updating color:', error);
      this.snackBar.open('Failed to update color', 'Dismiss', {
        duration: 3000,
      });
    }
  }

  editCategory(category: Category) {
    this.editingCategoryId.set(category.id);
    this.editNameControl.setValue(category.name);
  }

  cancelEdit() {
    this.editingCategoryId.set(null);
    this.editNameControl.reset();
  }

  async saveEdit(category: Category) {
    const newName = this.editNameControl.value?.trim();
    if (!newName || newName === category.name) {
      this.cancelEdit();
      return;
    }

    try {
      await firstValueFrom(
        this.apiService.updateCategory(category.id, { name: newName })
      );
      this.categories.update((cats) =>
        cats.map((c) => (c.id === category.id ? { ...c, name: newName } : c))
      );
      this.snackBar.open('Category updated', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error updating category:', error);
      this.snackBar.open('Failed to update category', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.cancelEdit();
    }
  }

  viewTransactions(category: Category) {
    this.router.navigate(['/dashboard/transactions'], {
      queryParams: { category: category.name },
    });
  }

  async deleteCategory(category: Category) {
    const confirmed = await firstValueFrom(
      this.dialogService.confirm(
        `Are you sure you want to delete "${category.name}"? This will remove the category from all transactions.`,
        'Delete Category',
        'Delete',
        'Cancel'
      )
    );

    if (!confirmed) return;

    const newDeleting = new Set(this.deleting());
    newDeleting.add(category.id);
    this.deleting.set(newDeleting);

    try {
      await firstValueFrom(this.apiService.deleteCategory(category.id));
      this.categories.update((cats) =>
        cats.filter((c) => c.id !== category.id)
      );
      this.expandedCategoryId.set(null);
      this.snackBar.open('Category deleted', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error deleting category:', error);
      this.snackBar.open('Failed to delete category', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      const updatedDeleting = new Set(this.deleting());
      updatedDeleting.delete(category.id);
      this.deleting.set(updatedDeleting);
    }
  }
}
