import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  ElementRef,
  ViewChild,
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
import { MatListModule } from '@angular/material/list';
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
    MatListModule,
    MatSnackBarModule,
  ],
  styleUrl: './categories.component.scss',
  template: `
    <div class="categories-container">
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <p class="page-subtitle">
              Organize your spending with custom categories
            </p>
          </div>
          <div class="controls-section">
            <div class="header-stats">
              <div class="stat-chip">
                <mat-icon>sell</mat-icon>
                <span>{{ categories().length }} Categories</span>
              </div>
            </div>
            <button
              mat-stroked-button
              (click)="seedDefaults()"
              [disabled]="seeding()"
              matTooltip="Add commonly used categories"
            >
              @if (seeding()) {
              <mat-spinner diameter="18"></mat-spinner>
              } @else {
              <mat-icon>auto_awesome</mat-icon>
              } Seed Defaults
            </button>
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
            <div class="color-picker">
              <input
                type="color"
                [formControl]="colorControl"
                class="color-input"
              />
            </div>
            <button
              mat-raised-button
              color="primary"
              (click)="addCategory()"
              [disabled]="!categoryControl.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
              } @else {
              <mat-icon>add</mat-icon>
              Add Category }
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="48"></mat-spinner>
        <h3>Loading Categories</h3>
      </div>
      } @else {
      <!-- Category Usage -->
      @if (categoryUsage().length > 0) {
      <mat-card class="analytics-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>bar_chart</mat-icon>
            Category Usage
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="category-stats">
            @for (usage of categoryUsage().slice(0, 8); track usage.categoryId;
            let idx = $index) {
            <div class="stat-item">
              <div class="stat-rank">#{{ idx + 1 }}</div>
              <div class="stat-content">
                <div class="stat-name">{{ usage.name }}</div>
                <div class="stat-details">
                  <span class="transaction-count"
                    >{{ usage.transactionCount }} transactions</span
                  >
                </div>
                <div class="usage-bar">
                  <div
                    class="usage-fill"
                    [style.width.%]="getUsagePercentage(usage.transactionCount)"
                  ></div>
                </div>
              </div>
            </div>
            }
          </div>
        </mat-card-content>
      </mat-card>
      }

      <!-- Categories List -->
      <mat-card class="categories-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>list</mat-icon>
            All Categories
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (categories().length === 0) {
          <div class="empty-state">
            <mat-icon>category</mat-icon>
            <h3>No Categories Yet</h3>
            <p>Add your first category or seed with defaults to get started</p>
          </div>
          } @else {
          <div class="categories-list">
            @for (category of categories(); track category.id) {
            <div class="category-item">
              <div
                class="category-color"
                [style.background-color]="category.color || '#666'"
              ></div>
              @if (editingCategoryId() === category.id) {
              <div class="category-edit-form">
                <mat-form-field appearance="outline" class="edit-input">
                  <input
                    matInput
                    [formControl]="editNameControl"
                    (keydown.enter)="saveEdit(category)"
                    (keydown.escape)="cancelEdit()"
                  />
                </mat-form-field>
                <button
                  mat-icon-button
                  (click)="saveEdit(category)"
                  [disabled]="!editNameControl.valid"
                >
                  <mat-icon>check</mat-icon>
                </button>
                <button mat-icon-button (click)="cancelEdit()">
                  <mat-icon>close</mat-icon>
                </button>
              </div>
              } @else {
              <div class="category-info">
                <span class="category-name">{{ category.name }}</span>
                @if (category.description) {
                <span class="category-description">{{
                  category.description
                }}</span>
                }
              </div>
              } @if (category.isSystem) {
              <span class="system-badge">System</span>
              } @if (editingCategoryId() !== category.id) {
              <div class="category-actions">
                <button
                  mat-icon-button
                  (click)="editCategory(category)"
                  matTooltip="Edit"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  mat-icon-button
                  (click)="deleteCategory(category)"
                  [disabled]="deleting().has(category.id) || category.isSystem"
                  matTooltip="Delete"
                  class="delete-btn"
                >
                  @if (deleting().has(category.id)) {
                  <mat-spinner diameter="18"></mat-spinner>
                  } @else {
                  <mat-icon>delete</mat-icon>
                  }
                </button>
              </div>
              }
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
export class CategoriesComponent implements OnInit {
  @ViewChild('categoryInput') categoryInput!: ElementRef<HTMLInputElement>;

  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);

  loading = signal(true);
  submitting = signal(false);
  seeding = signal(false);
  deleting = signal<Set<string>>(new Set());
  categories = signal<Category[]>([]);
  categoryUsage = signal<CategoryUsage[]>([]);
  editingCategoryId = signal<string | null>(null);
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

  private maxUsageCount = 1;

  ngOnInit() {
    this.loadData();
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
      this.maxUsageCount = Math.max(...usage.map((u) => u.transactionCount), 1);
    } catch (error) {
      console.error('Error loading categories:', error);
      this.snackBar.open('Failed to load categories', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.loading.set(false);
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
      this.loadData();
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

  getUsagePercentage(count: number): number {
    return (count / this.maxUsageCount) * 100;
  }
}
