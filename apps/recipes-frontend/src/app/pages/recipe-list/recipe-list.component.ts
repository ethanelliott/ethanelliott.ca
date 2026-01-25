import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  RecipesApiService,
  RecipeSummary,
  Category,
  Tag,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-recipe-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterLink,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatChipsModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Recipes</h1>
        <a mat-fab extended color="primary" routerLink="/recipes/new">
          <mat-icon>add</mat-icon>
          Add Recipe
        </a>
      </div>

      <div class="filters">
        <mat-form-field appearance="outline">
          <mat-label>Search recipes</mat-label>
          <input
            matInput
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
            placeholder="Search by title or description..."
          />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Categories</mat-label>
          <mat-select
            [ngModel]="selectedCategoryIds()"
            (ngModelChange)="selectedCategoryIds.set($event)"
            multiple
          >
            @for (category of categories(); track category.id) {
            <mat-option [value]="category.id">{{ category.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Tags</mat-label>
          <mat-select
            [ngModel]="selectedTagIds()"
            (ngModelChange)="selectedTagIds.set($event)"
            multiple
          >
            @for (tag of tags(); track tag.id) {
            <mat-option [value]="tag.id">{{ tag.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <button mat-button (click)="clearFilters()">
          <mat-icon>clear</mat-icon>
          Clear filters
        </button>
      </div>

      @if (loading()) {
      <div class="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
      } @else if (filteredRecipes().length === 0) {
      <div class="empty-state">
        <mat-icon>restaurant_menu</mat-icon>
        <h2>No recipes found</h2>
        <p>
          @if (hasFilters()) { Try adjusting your filters or search query. }
          @else { Start by adding your first recipe! }
        </p>
        @if (!hasFilters()) {
        <a mat-raised-button color="primary" routerLink="/recipes/new">
          <mat-icon>add</mat-icon>
          Add your first recipe
        </a>
        }
      </div>
      } @else {
      <div class="recipes-grid">
        @for (recipe of filteredRecipes(); track recipe.id) {
        <mat-card class="recipe-card" [routerLink]="['/recipes', recipe.id]">
          <mat-card-header>
            <mat-card-title>{{ recipe.title }}</mat-card-title>
            @if (recipe.description) {
            <mat-card-subtitle>{{ recipe.description }}</mat-card-subtitle>
            }
          </mat-card-header>
          <mat-card-content>
            <div class="recipe-meta">
              @if (recipe.prepTimeMinutes || recipe.cookTimeMinutes) {
              <div class="meta-item">
                <mat-icon>schedule</mat-icon>
                <span>
                  @if (recipe.prepTimeMinutes && recipe.cookTimeMinutes) {
                  {{ recipe.prepTimeMinutes + recipe.cookTimeMinutes }} min }
                  @else if (recipe.prepTimeMinutes) {
                  {{ recipe.prepTimeMinutes }} min prep } @else {
                  {{ recipe.cookTimeMinutes }} min cook }
                </span>
              </div>
              }
              <div class="meta-item">
                <mat-icon>people</mat-icon>
                <span>{{ recipe.servings }} servings</span>
              </div>
              @if (recipe.photoCount > 0) {
              <div class="meta-item">
                <mat-icon>photo_camera</mat-icon>
                <span>{{ recipe.photoCount }}</span>
              </div>
              }
            </div>
            @if (recipe.categories.length > 0 || recipe.tags.length > 0) {
            <div class="recipe-chips">
              @for (category of recipe.categories; track category.id) {
              <span
                class="chip category-chip"
                [style.background-color]="category.color || '#666'"
              >
                {{ category.name }}
              </span>
              } @for (tag of recipe.tags; track tag.id) {
              <span
                class="chip tag-chip"
                [style.border-color]="tag.color || '#666'"
                [style.color]="tag.color || '#666'"
              >
                {{ tag.name }}
              </span>
              }
            </div>
            }
          </mat-card-content>
        </mat-card>
        }
      </div>
      }
    </div>
  `,
  styles: `
    .page-container {
      max-width: 1400px;
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

    .filters {
      display: flex;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-lg);
      flex-wrap: wrap;
      align-items: center;
    }

    .filters mat-form-field {
      flex: 1;
      min-width: 200px;
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

    .recipes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--spacing-lg);
    }

    .recipe-card {
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .recipe-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--surface-elevation-2);
    }

    .recipe-meta {
      display: flex;
      gap: var(--spacing-lg);
      margin-bottom: var(--spacing-md);
      color: var(--mat-sys-on-surface-variant);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .meta-item mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }

    .recipe-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs);
    }

    .chip {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
    }

    .category-chip {
      color: white;
    }

    .tag-chip {
      background: transparent;
      border: 1px solid;
    }
  `,
})
export class RecipeListComponent implements OnInit {
  private readonly api = inject(RecipesApiService);

  loading = signal(true);
  recipes = signal<RecipeSummary[]>([]);
  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);

  searchQuery = signal('');
  selectedCategoryIds = signal<string[]>([]);
  selectedTagIds = signal<string[]>([]);

  hasFilters = computed(() => {
    return (
      this.searchQuery().length > 0 ||
      this.selectedCategoryIds().length > 0 ||
      this.selectedTagIds().length > 0
    );
  });

  filteredRecipes = computed(() => {
    let recipes = this.recipes();

    const search = this.searchQuery().toLowerCase();
    if (search) {
      recipes = recipes.filter(
        (r) =>
          r.title.toLowerCase().includes(search) ||
          r.description?.toLowerCase().includes(search)
      );
    }

    const categoryIds = this.selectedCategoryIds();
    if (categoryIds.length > 0) {
      recipes = recipes.filter((r) =>
        r.categories.some((c) => categoryIds.includes(c.id))
      );
    }

    const tagIds = this.selectedTagIds();
    if (tagIds.length > 0) {
      recipes = recipes.filter((r) =>
        r.tags.some((t) => tagIds.includes(t.id))
      );
    }

    return recipes;
  });

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading.set(true);

    // Load all data in parallel
    Promise.all([
      this.api.getRecipes().toPromise(),
      this.api.getCategories().toPromise(),
      this.api.getTags().toPromise(),
    ]).then(([recipes, categories, tags]) => {
      this.recipes.set(recipes || []);
      this.categories.set(categories || []);
      this.tags.set(tags || []);
      this.loading.set(false);
    });
  }

  clearFilters() {
    this.searchQuery.set('');
    this.selectedCategoryIds.set([]);
    this.selectedTagIds.set([]);
  }
}
