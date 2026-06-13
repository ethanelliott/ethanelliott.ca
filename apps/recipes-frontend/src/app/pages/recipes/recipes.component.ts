import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {
  RecipesApiService,
  RecipeSummary,
  Category,
  Tag,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-recipes',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    ChipModule,
    TagModule,
    ProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="recipes-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1 class="page-title">Recipes</h1>
          <span class="page-subtitle"
            >{{ filteredRecipes().length }} recipes</span
          >
        </div>
        <div class="header-actions">
          <p-button
            label="Import with AI"
            icon="pi pi-sparkles"
            severity="secondary"
            [outlined]="true"
            (click)="router.navigate(['/recipes/import'])"
          />
          <p-button
            label="Add Recipe"
            icon="pi pi-plus"
            (click)="router.navigate(['/recipes/new'])"
          />
        </div>
      </div>

      <!-- Filters -->
      <div class="filters">
        <div class="filter-row">
          <span class="p-input-icon-left filter-search">
            <input
              pInputText
              type="text"
              placeholder="Search recipes..."
              [(ngModel)]="searchQuery"
              (ngModelChange)="onFilterChange()"
            />
          </span>
          <p-multiselect
            [options]="categories()"
            [(ngModel)]="selectedCategories"
            optionLabel="name"
            placeholder="Categories"
            display="chip"
            class="filter-select"
            (ngModelChange)="onFilterChange()"
          />
          <p-multiselect
            [options]="tags()"
            [(ngModel)]="selectedTags"
            optionLabel="name"
            placeholder="Tags"
            display="chip"
            class="filter-select"
            (ngModelChange)="onFilterChange()"
          />
          @if (hasActiveFilters()) {
          <p-button
            label="Clear"
            icon="pi pi-times"
            severity="secondary"
            [text]="true"
            (click)="clearFilters()"
          />
          }
        </div>
      </div>

      <!-- Loading -->
      @if (loading()) {
      <div class="loading-container">
        <p-progress-spinner ariaLabel="Loading recipes" />
      </div>
      } @else if (filteredRecipes().length === 0) {
      <!-- Empty State -->
      <div class="empty-state">
        @if (recipes().length === 0) {
        <i class="pi pi-book empty-icon"></i>
        <h2>No recipes yet</h2>
        <p>Start building your recipe collection!</p>
        <p-button
          label="Add Your First Recipe"
          icon="pi pi-plus"
          (click)="router.navigate(['/recipes/new'])"
        />
        } @else {
        <i class="pi pi-search empty-icon"></i>
        <h2>No matches found</h2>
        <p>Try adjusting your filters</p>
        <p-button
          label="Clear Filters"
          icon="pi pi-times"
          severity="secondary"
          (click)="clearFilters()"
        />
        }
      </div>
      } @else {
      <!-- Recipe Grid -->
      <div class="recipe-grid">
        @for (recipe of filteredRecipes(); track recipe.id; let i = $index) {
        <div
          class="recipe-card"
          [style.animation-delay]="i * 50 + 'ms'"
          (click)="router.navigate(['/recipes', recipe.id])"
        >
          <h3 class="card-title">{{ recipe.title }}</h3>
          @if (recipe.description) {
          <p class="card-description">{{ recipe.description }}</p>
          }
          <div class="card-meta">
            @if (recipe.prepTimeMinutes || recipe.cookTimeMinutes) {
            <span class="meta-item">
              <i class="pi pi-clock"></i>
              {{ getTotalTime(recipe) }} min
            </span>
            }
            <span class="meta-item">
              <i class="pi pi-users"></i>
              {{ recipe.servings }} servings
            </span>
            @if (recipe.photoCount > 0) {
            <span class="meta-item">
              <i class="pi pi-image"></i>
              {{ recipe.photoCount }}
            </span>
            }
          </div>
          @if (recipe.categories.length > 0) {
          <div class="card-chips">
            @for (cat of recipe.categories; track cat.id) {
            <span
              class="category-chip"
              [style.background]="cat.color || 'var(--p-primary-color)'"
              [style.color]="'#000'"
            >
              {{ cat.name }}
            </span>
            }
          </div>
          } @if (recipe.tags.length > 0) {
          <div class="card-chips">
            @for (tag of recipe.tags; track tag.id) {
            <span
              class="tag-chip"
              [style.border-color]="tag.color || 'var(--p-primary-color)'"
              [style.color]="tag.color || 'var(--p-primary-color)'"
            >
              {{ tag.name }}
            </span>
            }
          </div>
          }
        </div>
        }
      </div>
      }
    </div>
  `,
  styles: `
    @use 'styles/shared' as *;
    @include fade-in-keyframes;

    .recipes-page {
      @include page(1200px);
    }

    .page-header {
      @include page-header;
    }

    .page-title {
      @include page-title;
    }

    .page-subtitle {
      @include page-subtitle;
      margin: 0;
    }

    .header-actions {
      @include header-actions;
    }

    .filters {
      margin-bottom: 24px;
    }

    .filter-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .filter-search {
      flex: 1;
      min-width: 200px;

      input {
        width: 100%;
      }
    }

    .filter-select {
      min-width: 180px;
    }

    @include mobile {
      .filter-row {
        flex-direction: column;
        align-items: stretch;
      }

      .filter-search,
      .filter-select {
        min-width: 0;
        width: 100%;
      }
    }

    .loading-container {
      @include loading-container;
    }

    .empty-state {
      @include empty-state;
    }

    .recipe-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .recipe-card {
      @include card;
      @include fade-in;
      padding: 20px;
      cursor: pointer;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

      &:hover {
        border-color: var(--p-primary-color);
        box-shadow: 0 0 20px color-mix(in srgb, var(--p-primary-color) 15%, transparent);
        transform: translateY(-2px);
      }
    }

    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 6px;
      color: var(--p-text-color);
    }

    .card-description {
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
      margin: 0 0 12px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-meta {
      display: flex;
      gap: 16px;
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
      margin-bottom: 12px;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;

      i {
        font-size: 0.85rem;
      }
    }

    .card-chips {
      @include chip-row;
      margin-top: 8px;
    }

    .category-chip {
      @include chip-category;
    }

    .tag-chip {
      @include chip-tag;
    }

    @include mobile {
      .recipe-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class RecipesComponent implements OnInit {
  private api = inject(RecipesApiService);
  router = inject(Router);

  recipes = signal<RecipeSummary[]>([]);
  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);
  loading = signal(true);

  searchQuery = '';
  selectedCategories: Category[] = [];
  selectedTags: Tag[] = [];

  filteredRecipes = signal<RecipeSummary[]>([]);

  hasActiveFilters = computed(
    () =>
      this.searchQuery.trim().length > 0 ||
      this.selectedCategories.length > 0 ||
      this.selectedTags.length > 0
  );

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading.set(true);

    this.api.getCategories().subscribe((cats) => this.categories.set(cats));
    this.api.getTags().subscribe((tags) => this.tags.set(tags));
    this.api.getRecipes().subscribe((recipes) => {
      this.recipes.set(recipes);
      this.filteredRecipes.set(recipes);
      this.loading.set(false);
    });
  }

  onFilterChange() {
    const search = this.searchQuery.trim().toLowerCase();
    const catIds = new Set(this.selectedCategories.map((c) => c.id));
    const tagIds = new Set(this.selectedTags.map((t) => t.id));

    const filtered = this.recipes().filter((recipe) => {
      if (
        search &&
        !recipe.title.toLowerCase().includes(search) &&
        !(recipe.description || '').toLowerCase().includes(search)
      ) {
        return false;
      }
      if (catIds.size > 0 && !recipe.categories.some((c) => catIds.has(c.id))) {
        return false;
      }
      if (tagIds.size > 0 && !recipe.tags.some((t) => tagIds.has(t.id))) {
        return false;
      }
      return true;
    });

    this.filteredRecipes.set(filtered);
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedCategories = [];
    this.selectedTags = [];
    this.filteredRecipes.set(this.recipes());
  }

  getTotalTime(recipe: RecipeSummary): number {
    return (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  }
}
