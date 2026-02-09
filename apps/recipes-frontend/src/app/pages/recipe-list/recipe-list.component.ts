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
        <div class="header-text">
          <h1>Recipes</h1>
          <p class="subtitle">{{ filteredRecipes().length }} recipes in your collection</p>
        </div>
        <a mat-fab extended color="primary" routerLink="/recipes/new" class="add-btn">
          <mat-icon>add</mat-icon>
          Add Recipe
        </a>
      </div>

      <div class="filters-card">
        <div class="filters">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Search recipes</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
              placeholder="Search by title or description..."
            />
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

          @if (hasFilters()) {
          <button mat-button (click)="clearFilters()" class="clear-btn">
            <mat-icon>close</mat-icon>
            Clear
          </button>
          }
        </div>
      </div>

      @if (loading()) {
      <div class="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
      } @else if (filteredRecipes().length === 0) {
      <div class="empty-state">
        <div class="empty-icon-wrapper">
          <mat-icon>restaurant_menu</mat-icon>
        </div>
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
        @for (recipe of filteredRecipes(); track recipe.id; let i = $index) {
        <div class="recipe-card" [routerLink]="['/recipes', recipe.id]" [style.--delay]="i">
          <div class="card-glow"></div>
          <div class="card-content">
            <div class="card-header">
              <h3>{{ recipe.title }}</h3>
              @if (recipe.description) {
              <p class="description">{{ recipe.description }}</p>
              }
            </div>
            <div class="card-meta">
              @if (recipe.prepTimeMinutes || recipe.cookTimeMinutes) {
              <div class="meta-item">
                <mat-icon>schedule</mat-icon>
                <span>
                  {{ (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0) }} min
                </span>
              </div>
              }
              <div class="meta-item">
                <mat-icon>people</mat-icon>
                <span>{{ recipe.servings }}</span>
              </div>
              @if (recipe.photoCount > 0) {
              <div class="meta-item">
                <mat-icon>photo_camera</mat-icon>
                <span>{{ recipe.photoCount }}</span>
              </div>
              }
            </div>
            @if (recipe.categories.length > 0 || recipe.tags.length > 0) {
            <div class="card-chips">
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
          </div>
        </div>
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
      align-items: flex-start;
      margin-bottom: var(--spacing-xl);
    }

    .header-text h1 {
      margin: 0;
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #fafafa, #a1a1aa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      margin: var(--spacing-xs) 0 0;
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.875rem;
    }

    .add-btn {
      flex-shrink: 0;
    }

    .filters-card {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
      margin-bottom: var(--spacing-xl);
    }

    .filters {
      display: flex;
      gap: var(--spacing-md);
      flex-wrap: wrap;
      align-items: center;
    }

    .search-field {
      flex: 2;
      min-width: 280px;
    }

    .filters mat-form-field:not(.search-field) {
      flex: 1;
      min-width: 160px;
    }

    .clear-btn {
      color: rgba(255, 255, 255, 0.6);
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

    .empty-icon-wrapper {
      width: 80px;
      height: 80px;
      margin: 0 auto var(--spacing-lg);
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(239, 68, 68, 0.1));
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-icon-wrapper mat-icon {
      font-size: 2.5rem;
      width: 2.5rem;
      height: 2.5rem;
      color: #f97316;
    }

    .empty-state h2 {
      margin: 0 0 var(--spacing-sm);
      font-weight: 600;
    }

    .empty-state p {
      color: rgba(255, 255, 255, 0.5);
      margin: 0 0 var(--spacing-lg);
    }

    .recipes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--spacing-lg);
    }

    .recipe-card {
      position: relative;
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
      cursor: pointer;
      transition: all 0.25s ease;
      overflow: hidden;
      animation: fadeIn 0.4s ease-out backwards;
      animation-delay: calc(var(--delay, 0) * 40ms);
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }

    .card-glow {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(249, 115, 22, 0.5), transparent);
      opacity: 0;
      transition: opacity 0.25s ease;
    }

    .recipe-card:hover {
      transform: translateY(-4px);
      border-color: var(--border-default);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    }

    .recipe-card:hover .card-glow {
      opacity: 1;
    }

    .card-content {
      position: relative;
      z-index: 1;
    }

    .card-header h3 {
      margin: 0 0 var(--spacing-xs);
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
      line-height: 1.3;
    }

    .card-header .description {
      margin: 0;
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.5);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-meta {
      display: flex;
      gap: var(--spacing-lg);
      margin: var(--spacing-md) 0;
      padding: var(--spacing-md) 0;
      border-top: 1px solid var(--border-subtle);
      border-bottom: 1px solid var(--border-subtle);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.8rem;
    }

    .meta-item mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }

    .card-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: var(--spacing-md);
    }

    .chip {
      padding: 4px 10px;
      border-radius: var(--border-radius-full);
      font-size: 0.7rem;
      font-weight: 500;
    }

    .category-chip {
      color: white;
    }

    .tag-chip {
      background: transparent;
      border: 1px solid;
    }

    @media (max-width: 640px) {
      .page-header {
        flex-direction: column;
        gap: var(--spacing-md);
      }

      .add-btn {
        width: 100%;
      }

      .filters {
        flex-direction: column;
      }

      .filters mat-form-field {
        width: 100%;
      }
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
