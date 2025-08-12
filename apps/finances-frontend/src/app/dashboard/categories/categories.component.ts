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
import { injectFinanceStore } from '../../store/finance.provider';

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
  styleUrl: './categories.component.scss',
  template: `
    <div class="categories-container">
      <!-- Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <h1 class="page-title">Categories</h1>
            <p class="page-subtitle">
              Organize your transactions with custom categories
            </p>
          </div>
        </div>
      </div>

      <!-- Add Category Form -->
      <mat-card class="add-category-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon fontIcon="fa-plus"></mat-icon>
            Add New Category
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="categoryForm" class="category-form">
            <div class="form-row">
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
                  <mat-icon fontIcon="fa-plus"></mat-icon>
                  Add Category
                </ng-container>
                }
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Categories List -->
      <mat-card class="categories-list-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon fontIcon="fa-layer-group"></mat-icon>
            All Categories
          </mat-card-title>
          <mat-card-subtitle
            >{{ financeStore.categories().length }} categories
            available</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <h3>Loading categories...</h3>
            <p>Please wait while we fetch your categories</p>
          </div>
          } @else if (financeStore.categories().length === 0) {
          <div class="empty-state">
            <mat-icon fontIcon="fa-layer-group"></mat-icon>
            <h3>No categories yet</h3>
            <p>
              Add your first category above to start organizing your
              transactions
            </p>
          </div>
          } @else {
          <mat-list class="categories-list">
            @for (category of financeStore.categories(); track category) {
            <mat-list-item class="category-item">
              <div matListItemTitle class="category-info">
                <mat-icon matListItemIcon class="category-icon"
                  >fa-tag</mat-icon
                >
                <span class="category-name">{{ category }}</span>
              </div>
              <div class="category-actions">
                <button
                  mat-icon-button
                  (click)="deleteCategory(category)"
                  class="delete-button"
                  [disabled]="deleting().has(category)"
                  matTooltip="Delete category"
                >
                  @if (deleting().has(category)) {
                  <mat-spinner diameter="16"></mat-spinner>
                  } @else {
                  <mat-icon fontIcon="fa-trash"></mat-icon>
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
          <mat-card-title>
            <mat-icon fontIcon="fa-lightbulb"></mat-icon>
            Common Categories
          </mat-card-title>
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
              [disabled]="
                financeStore.categories().includes(suggestion) || submitting()
              "
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
})
export class CategoriesComponent implements OnInit {
  readonly financeStore = injectFinanceStore();
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());

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
    // Load data if not already loaded
    if (!this.financeStore.initialLoadComplete()) {
      this.financeStore.loadAllData();
    }
    this.loading.set(false);
  }

  addCategory() {
    if (!this.categoryForm.valid) return;

    this.submitting.set(true);
    const categoryName = this.categoryForm.value.name.trim();

    this.financeStore.createCategory(categoryName);
    this.submitting.set(false);
    this.categoryForm.reset();
  }

  addSuggestedCategory(categoryName: string) {
    this.submitting.set(true);
    this.financeStore.createCategory(categoryName);
    this.submitting.set(false);
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

    this.financeStore.deleteCategory(categoryName);

    // Remove from deleting set
    const updatedDeleting = new Set(this.deleting());
    updatedDeleting.delete(categoryName);
    this.deleting.set(updatedDeleting);
  }
}
