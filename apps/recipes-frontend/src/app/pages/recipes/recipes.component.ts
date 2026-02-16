import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AiImportDialogComponent } from '../../components/ai-import-dialog/ai-import-dialog.component';
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
    AiImportDialogComponent,
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
            (click)="aiImport().open()"
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

      <!-- AI Import Dialog -->
      <app-ai-import-dialog (closed)="onAiImportClose()" />
    </div>
  `,
  styles: `
    .recipes-page {
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .page-title {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0;
      color: var(--p-text-color);
    }

    .page-subtitle {
      font-size: 0.875rem;
      color: var(--p-text-muted-color);
    }

    .header-actions {
      display: flex;
      gap: 8px;
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

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 64px 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 24px;
      text-align: center;
      gap: 8px;
    }

    .empty-icon {
      font-size: 3rem;
      color: var(--p-text-muted-color);
      margin-bottom: 8px;
    }

    .empty-state h2 {
      margin: 0;
      font-size: 1.25rem;
      color: var(--p-text-color);
    }

    .empty-state p {
      margin: 0;
      color: var(--p-text-muted-color);
    }

    .recipe-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .recipe-card {
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      animation: fadeIn 0.3s ease forwards;
      opacity: 0;

      &:hover {
        border-color: var(--p-primary-color);
        box-shadow: 0 0 20px color-mix(in srgb, var(--p-primary-color) 15%, transparent);
        transform: translateY(-2px);
      }
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
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
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .category-chip {
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .tag-chip {
      padding: 2px 10px;
      border: 1.5px solid;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      background: transparent;
    }

    @media (max-width: 640px) {
      .recipe-grid {
        grid-template-columns: 1fr;
      }

      .header-actions {
        width: 100%;
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
  aiImport = viewChild.required(AiImportDialogComponent);

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

  onAiImportClose() {
    this.loadData();
  }
}
