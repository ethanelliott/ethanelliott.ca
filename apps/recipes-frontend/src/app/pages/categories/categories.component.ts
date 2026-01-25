import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import {
  RecipesApiService,
  Category,
  CategoryInput,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatDialogModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Categories</h1>
        <button mat-fab extended color="primary" (click)="openForm()">
          <mat-icon>add</mat-icon>
          Add Category
        </button>
      </div>

      @if (loading()) {
      <div class="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
      } @else if (categories().length === 0) {
      <div class="empty-state">
        <mat-icon>category</mat-icon>
        <h2>No categories yet</h2>
        <p>Create categories to organize your recipes.</p>
      </div>
      } @else {
      <div class="categories-grid">
        @for (category of categories(); track category.id) {
        <mat-card class="category-card">
          <div
            class="category-color"
            [style.background-color]="category.color || '#666'"
          ></div>
          <mat-card-content>
            <h3>{{ category.name }}</h3>
            @if (category.description) {
            <p>{{ category.description }}</p>
            }
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button (click)="openForm(category)">
              <mat-icon>edit</mat-icon>
              Edit
            </button>
            <button mat-button color="warn" (click)="deleteCategory(category)">
              <mat-icon>delete</mat-icon>
              Delete
            </button>
          </mat-card-actions>
        </mat-card>
        }
      </div>
      }

      <!-- Inline Form -->
      @if (showForm()) {
      <div class="form-overlay" (click)="closeForm()">
        <mat-card class="form-card" (click)="$event.stopPropagation()">
          <mat-card-header>
            <mat-card-title>{{
              editingCategory() ? 'Edit Category' : 'New Category'
            }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Name</mat-label>
              <input
                matInput
                [(ngModel)]="formData.name"
                placeholder="Category name"
              />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description</mat-label>
              <textarea
                matInput
                [(ngModel)]="formData.description"
                rows="2"
                placeholder="Optional description"
              ></textarea>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Color</mat-label>
              <input matInput type="color" [(ngModel)]="formData.color" />
            </mat-form-field>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button (click)="closeForm()">Cancel</button>
            <button
              mat-raised-button
              color="primary"
              (click)="saveCategory()"
              [disabled]="!formData.name"
            >
              {{ editingCategory() ? 'Save' : 'Create' }}
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
      }
    </div>
  `,
  styles: `
    .page-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-lg);
    }

    h1 {
      margin: 0;
      font-size: 2rem;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-2xl);
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-3xl);
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-state mat-icon {
      font-size: 4rem;
      width: 4rem;
      height: 4rem;
      margin-bottom: var(--spacing-md);
    }

    .categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--spacing-lg);
    }

    .category-card {
      overflow: hidden;
    }

    .category-color {
      height: 8px;
    }

    .category-card h3 {
      margin: 0 0 var(--spacing-sm);
    }

    .category-card p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .form-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .form-card {
      width: 100%;
      max-width: 400px;
    }

    .full-width {
      width: 100%;
    }
  `,
})
export class CategoriesComponent implements OnInit {
  private readonly api = inject(RecipesApiService);

  loading = signal(true);
  categories = signal<Category[]>([]);
  showForm = signal(false);
  editingCategory = signal<Category | null>(null);

  formData = {
    name: '',
    description: '',
    color: '#666666',
  };

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.loading.set(true);
    this.api.getCategories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loading.set(false);
      },
    });
  }

  openForm(category?: Category) {
    if (category) {
      this.editingCategory.set(category);
      this.formData = {
        name: category.name,
        description: category.description || '',
        color: category.color || '#666666',
      };
    } else {
      this.editingCategory.set(null);
      this.formData = {
        name: '',
        description: '',
        color: '#666666',
      };
    }
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editingCategory.set(null);
  }

  saveCategory() {
    const input: CategoryInput = {
      name: this.formData.name,
      description: this.formData.description || undefined,
      color: this.formData.color,
    };

    const editing = this.editingCategory();
    const request = editing
      ? this.api.updateCategory(editing.id, input)
      : this.api.createCategory(input);

    request.subscribe({
      next: () => {
        this.closeForm();
        this.loadCategories();
      },
    });
  }

  deleteCategory(category: Category) {
    if (confirm(`Delete category "${category.name}"?`)) {
      this.api.deleteCategory(category.id).subscribe({
        next: () => this.loadCategories(),
      });
    }
  }
}
