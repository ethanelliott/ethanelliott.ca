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
        <div class="header-text">
          <h1>Categories</h1>
          <p class="subtitle">Organize your recipes by meal type</p>
        </div>
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
        <div class="empty-icon">
          <mat-icon>category</mat-icon>
        </div>
        <h2>No categories yet</h2>
        <p>Create categories to organize your recipes.</p>
      </div>
      } @else {
      <div class="categories-grid">
        @for (category of categories(); track category.id; let i = $index) {
        <div class="category-card" [style.--delay]="i">
          <div class="category-glow" [style.background]="'linear-gradient(90deg, transparent, ' + (category.color || '#666') + ', transparent)'"></div>
          <div class="category-indicator" [style.background]="category.color || '#666'"></div>
          <div class="category-content">
            <h3>{{ category.name }}</h3>
            @if (category.description) {
            <p>{{ category.description }}</p>
            }
          </div>
          <div class="category-actions">
            <button mat-icon-button (click)="openForm(category)">
              <mat-icon>edit</mat-icon>
            </button>
            <button mat-icon-button color="warn" (click)="deleteCategory(category)">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </div>
        }
      </div>
      }

      <!-- Form Modal -->
      @if (showForm()) {
      <div class="form-overlay" (click)="closeForm()">
        <div class="form-card" (click)="$event.stopPropagation()">
          <div class="form-header">
            <h2>{{ editingCategory() ? 'Edit Category' : 'New Category' }}</h2>
            <button mat-icon-button (click)="closeForm()">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="form-body">
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

            <div class="color-picker">
              <label>Color</label>
              <div class="color-preview" [style.background]="formData.color"></div>
              <input type="color" [(ngModel)]="formData.color" />
            </div>
          </div>
          <div class="form-actions">
            <button mat-button (click)="closeForm()">Cancel</button>
            <button
              mat-raised-button
              color="primary"
              (click)="saveCategory()"
              [disabled]="!formData.name"
            >
              {{ editingCategory() ? 'Save' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
      }
    </div>
  `,
  styles: `
    .page-container {
      max-width: 1000px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--spacing-xl);
    }

    .header-text h1 {
      margin: 0;
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .subtitle {
      margin: var(--spacing-xs) 0 0;
      color: rgba(255, 255, 255, 0.5);
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-3xl);
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-3xl);
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto var(--spacing-lg);
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-icon mat-icon {
      font-size: 2.5rem;
      width: 2.5rem;
      height: 2.5rem;
      color: rgba(255, 255, 255, 0.3);
    }

    .empty-state h2 {
      margin: 0 0 var(--spacing-sm);
      font-weight: 600;
    }

    .empty-state p {
      color: rgba(255, 255, 255, 0.5);
      margin: 0;
    }

    .categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--spacing-lg);
    }

    .category-card {
      position: relative;
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
      overflow: hidden;
      animation: fadeIn 0.4s ease-out backwards;
      animation-delay: calc(var(--delay, 0) * 50ms);
      transition: all 0.25s ease;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }

    .category-card:hover {
      border-color: var(--border-default);
      transform: translateY(-2px);
    }

    .category-glow {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      opacity: 0;
      transition: opacity 0.25s ease;
    }

    .category-card:hover .category-glow {
      opacity: 0.8;
    }

    .category-indicator {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      border-radius: 0 4px 4px 0;
    }

    .category-content {
      padding-left: var(--spacing-sm);
    }

    .category-content h3 {
      margin: 0 0 var(--spacing-xs);
      font-size: 1.125rem;
      font-weight: 600;
    }

    .category-content p {
      margin: 0;
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.875rem;
    }

    .category-actions {
      position: absolute;
      top: var(--spacing-sm);
      right: var(--spacing-sm);
      display: flex;
      gap: var(--spacing-xs);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .category-card:hover .category-actions {
      opacity: 1;
    }

    .form-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    }

    .form-card {
      width: 100%;
      max-width: 400px;
      background: linear-gradient(145deg, #141414, #0a0a0a);
      border: 1px solid var(--border-emphasis);
      border-radius: var(--border-radius-xl);
      overflow: hidden;
    }

    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-lg);
      border-bottom: 1px solid var(--border-subtle);
    }

    .form-header h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .form-body {
      padding: var(--spacing-lg);
    }

    .full-width {
      width: 100%;
    }

    .color-picker {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .color-picker label {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.875rem;
    }

    .color-preview {
      width: 32px;
      height: 32px;
      border-radius: var(--border-radius-sm);
      border: 1px solid var(--border-default);
    }

    .color-picker input[type="color"] {
      width: 40px;
      height: 32px;
      border: none;
      background: none;
      cursor: pointer;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) var(--spacing-lg);
      border-top: 1px solid var(--border-subtle);
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
