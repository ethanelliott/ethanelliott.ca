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
import { FinanceApiService } from '../../services/finance-api.service';

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
    MatListModule,
    MatDividerModule,
  ],
  template: `
    <div class="categories-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h1 class="page-title">Categories</h1>
          <p class="page-subtitle">
            Organize your transactions with custom categories
          </p>
        </div>
      </div>

      <!-- Add Category Form -->
      <mat-card class="add-category-card">
        <mat-card-header>
          <mat-card-title>Add New Category</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="categoryForm" class="category-form">
            <mat-form-field appearance="outline" class="category-name-field">
              <mat-label>Category Name</mat-label>
              <input
                matInput
                formControlName="name"
                required
                placeholder="e.g., Food, Transportation, Entertainment"
              />
            </mat-form-field>
            <button
              mat-raised-button
              color="primary"
              (click)="addCategory()"
              [disabled]="!categoryForm.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
              Add Category } @else {
              <ng-container>
                <mat-icon>add</mat-icon>
                Add Category
              </ng-container>
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Categories List -->
      <mat-card class="categories-list-card">
        <mat-card-header>
          <mat-card-title>All Categories</mat-card-title>
          <mat-card-subtitle
            >{{ categories().length }} categories available</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <p>Loading categories...</p>
          </div>
          } @else if (categories().length === 0) {
          <div class="empty-state">
            <mat-icon>category</mat-icon>
            <h3>No categories yet</h3>
            <p>
              Add your first category above to start organizing your
              transactions
            </p>
          </div>
          } @else {
          <mat-list class="categories-list">
            @for (category of categories(); track category) {
            <mat-list-item class="category-item">
              <div matListItemTitle class="category-info">
                <mat-icon matListItemIcon class="category-icon"
                  >category</mat-icon
                >
                <span class="category-name">{{ category }}</span>
              </div>
              <div class="category-actions">
                <button
                  mat-icon-button
                  (click)="deleteCategory(category)"
                  class="delete-button"
                  [disabled]="deleting().has(category)"
                >
                  @if (deleting().has(category)) {
                  <mat-spinner diameter="16"></mat-spinner>
                  } @else {
                  <mat-icon>delete</mat-icon>
                  }
                </button>
              </div>
            </mat-list-item>
            <mat-divider></mat-divider>
            }
          </mat-list>
          }
        </mat-card-content>
      </mat-card>

      <!-- Quick Add Suggestions -->
      <mat-card class="suggestions-card">
        <mat-card-header>
          <mat-card-title>Common Categories</mat-card-title>
          <mat-card-subtitle
            >Click to quickly add popular categories</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <div class="suggestions-grid">
            @for (suggestion of commonCategories; track suggestion) {
            <button
              mat-stroked-button
              (click)="addSuggestedCategory(suggestion)"
              [disabled]="categories().includes(suggestion) || submitting()"
              class="suggestion-chip"
            >
              {{ suggestion }}
            </button>
            }
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .categories-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 16px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      font-size: 2rem;
      font-weight: 400;
      margin: 0;
      color: var(--mat-primary-color);
    }

    .page-subtitle {
      color: var(--mat-secondary-text-color);
      margin: 4px 0 0 0;
    }

    .add-category-card {
      margin-bottom: 24px;
      border: 2px solid var(--mat-primary-color);
    }

    .category-form {
      display: flex;
      gap: 16px;
      align-items: flex-end;
    }

    .category-name-field {
      flex: 1;
    }

    .add-button {
      gap: 8px;
      min-width: 140px;
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
      color: var(--mat-secondary-text-color);
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

    .categories-list {
      padding: 0;
    }

    .category-item {
      padding: 16px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .category-info {
      display: flex;
      align-items: center;
      gap: 16px;
      flex: 1;
    }

    .category-icon {
      color: var(--mat-primary-color);
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .category-name {
      font-size: 1.1rem;
      font-weight: 500;
      text-transform: capitalize;
    }

    .category-actions {
      margin-left: 16px;
    }

    .delete-button {
      color: var(--mat-error-color);
    }

    .suggestions-card {
      margin-bottom: 24px;
    }

    .suggestions-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .suggestion-chip {
      text-transform: capitalize;
      transition: all 0.2s ease;
    }

    .suggestion-chip:not(:disabled):hover {
      background: var(--mat-primary-container-color);
      color: var(--mat-on-primary-container-color);
    }

    .suggestion-chip:disabled {
      opacity: 0.5;
    }

    @media (max-width: 768px) {
      .category-form {
        flex-direction: column;
        align-items: stretch;
      }

      .add-button {
        margin-top: 16px;
      }

      .suggestions-grid {
        justify-content: center;
      }
    }
  `,
})
export class CategoriesComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());
  categories = signal<string[]>([]);

  categoryForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

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
    this.loadCategories();
  }

  private loadCategories() {
    this.apiService.getAllCategories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading categories:', error);
        this.loading.set(false);
        this.snackBar.open('Error loading categories', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  addCategory() {
    if (!this.categoryForm.valid) return;

    this.submitting.set(true);
    const categoryName = this.categoryForm.value.name.trim();

    this.apiService.createCategory({ name: categoryName }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open('Category added successfully', 'Close', {
          duration: 3000,
        });
        this.categoryForm.reset();
        this.loadCategories();
      },
      error: (error) => {
        console.error('Error adding category:', error);
        this.submitting.set(false);
        this.snackBar.open('Error adding category', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  addSuggestedCategory(categoryName: string) {
    this.submitting.set(true);

    this.apiService.createCategory({ name: categoryName }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(`"${categoryName}" added successfully`, 'Close', {
          duration: 3000,
        });
        this.loadCategories();
      },
      error: (error) => {
        console.error('Error adding suggested category:', error);
        this.submitting.set(false);
        this.snackBar.open('Error adding category', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  deleteCategory(categoryName: string) {
    if (
      !confirm(
        `Are you sure you want to delete the category "${categoryName}"?`
      )
    )
      return;

    // Add to deleting set
    const newDeleting = new Set(this.deleting());
    newDeleting.add(categoryName);
    this.deleting.set(newDeleting);

    this.apiService.deleteCategory(categoryName).subscribe({
      next: () => {
        // Remove from deleting set
        const updatedDeleting = new Set(this.deleting());
        updatedDeleting.delete(categoryName);
        this.deleting.set(updatedDeleting);

        this.snackBar.open('Category deleted successfully', 'Close', {
          duration: 3000,
        });
        this.loadCategories();
      },
      error: (error) => {
        console.error('Error deleting category:', error);

        // Remove from deleting set on error too
        const updatedDeleting = new Set(this.deleting());
        updatedDeleting.delete(categoryName);
        this.deleting.set(updatedDeleting);

        this.snackBar.open('Error deleting category', 'Close', {
          duration: 3000,
        });
      },
    });
  }
}
