import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {
  RecipesApiService,
  Recipe,
  Category,
  Tag,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-random-recipe',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    ButtonModule,
    MultiSelectModule,
    ChipModule,
    TagModule,
    ProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="random-page">
      <!-- Hero -->
      <div class="hero">
        <div class="pulse-icon" [class.spinning]="spinning()">
          <i class="pi pi-sparkles"></i>
        </div>
        <h1>Random Recipe</h1>
        <p class="subtitle">Let us pick something for you</p>
      </div>

      <!-- Controls -->
      <div class="controls">
        <p-multiselect
          [options]="categories()"
          [(ngModel)]="selectedCategoryIds"
          optionLabel="name"
          optionValue="id"
          placeholder="Filter by categories"
          display="chip"
        />
        <p-multiselect
          [options]="tags()"
          [(ngModel)]="selectedTagIds"
          optionLabel="name"
          optionValue="id"
          placeholder="Filter by tags"
          display="chip"
        />
        <p-button
          label="Spin the Wheel"
          icon="pi pi-sync"
          (click)="spin()"
          [loading]="spinning()"
        />
      </div>

      <!-- Result -->
      @if (noMatch()) {
      <div class="empty-state">
        <i class="pi pi-info-circle"></i>
        <p>
          @if (selectedCategoryIds.length > 0 || selectedTagIds.length > 0) { No
          recipes match your filters. Try removing some. } @else { No recipes
          found. Add some recipes first! }
        </p>
      </div>
      } @if (result()) {
      <div class="result-card" [class.visible]="result()">
        <h2 class="result-title">{{ result()!.title }}</h2>
        @if (result()!.description) {
        <p class="result-desc">{{ result()!.description }}</p>
        }
        <div class="result-meta">
          @if (result()!.prepTimeMinutes) {
          <span class="meta-badge">
            <i class="pi pi-clock"></i>
            {{ result()!.prepTimeMinutes }}m prep
          </span>
          } @if (result()!.cookTimeMinutes) {
          <span class="meta-badge">
            <i class="pi pi-stopwatch"></i>
            {{ result()!.cookTimeMinutes }}m cook
          </span>
          }
          <span class="meta-badge">
            <i class="pi pi-users"></i>
            {{ result()!.servings }} servings
          </span>
        </div>
        @if (result()!.categories.length > 0 || result()!.tags.length > 0) {
        <div class="result-chips">
          @for (cat of result()!.categories; track cat.id) {
          <p-chip [label]="cat.name" />
          } @for (tag of result()!.tags; track tag.id) {
          <p-tag [value]="tag.name" [rounded]="true" severity="secondary" />
          }
        </div>
        }
        <div class="result-actions">
          <p-button
            label="View Recipe"
            icon="pi pi-eye"
            (click)="router.navigate(['/recipes', result()!.id])"
          />
          <p-button
            label="Try Again"
            icon="pi pi-sync"
            severity="secondary"
            [outlined]="true"
            (click)="spin()"
          />
        </div>
      </div>
      }
    </div>
  `,
  styles: `
    .random-page {
      max-width: 600px;
      margin: 0 auto;
      text-align: center;
    }

    .hero {
      padding: 32px 0;

      h1 {
        margin: 16px 0 8px;
        font-size: 2rem;
        font-weight: 700;
      }

      .subtitle {
        color: var(--p-text-muted-color);
        margin: 0;
      }
    }

    .pulse-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--p-primary-color);
      color: var(--p-primary-contrast-color);
      font-size: 1.5rem;
      animation: pulse 2s ease-in-out infinite;

      &.spinning {
        animation: spin 0.6s linear infinite;
      }
    }

    .controls {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 32px;
    }

    .empty-state {
      padding: 32px;
      color: var(--p-text-muted-color);

      i {
        font-size: 2rem;
        margin-bottom: 12px;
      }
    }

    .result-card {
      background: var(--p-surface-800);
      border-radius: 16px;
      padding: 32px;
      animation: slideIn 0.4s ease-out;
    }

    .result-title {
      margin: 0 0 8px;
      font-size: 1.5rem;
      font-weight: 700;
    }

    .result-desc {
      color: var(--p-text-muted-color);
      margin: 0 0 16px;
    }

    .result-meta {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }

    .meta-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 20px;
      background: var(--p-surface-700);
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
    }

    .result-chips {
      display: flex;
      justify-content: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .result-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
})
export class RandomRecipeComponent implements OnInit {
  private api = inject(RecipesApiService);
  router = inject(Router);

  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);
  spinning = signal(false);
  result = signal<Recipe | null>(null);
  noMatch = signal(false);

  selectedCategoryIds: string[] = [];
  selectedTagIds: string[] = [];

  ngOnInit() {
    this.api.getCategories().subscribe((c) => this.categories.set(c));
    this.api.getTags().subscribe((t) => this.tags.set(t));
  }

  spin() {
    this.spinning.set(true);
    this.result.set(null);
    this.noMatch.set(false);

    const filters: { categoryIds?: string[]; tagIds?: string[] } = {};
    if (this.selectedCategoryIds.length > 0) {
      filters.categoryIds = this.selectedCategoryIds;
    }
    if (this.selectedTagIds.length > 0) {
      filters.tagIds = this.selectedTagIds;
    }

    this.api.getRandomRecipe(filters).subscribe((recipe) => {
      this.spinning.set(false);
      if (recipe) {
        this.result.set(recipe);
      } else {
        this.noMatch.set(true);
      }
    });
  }
}
