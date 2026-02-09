import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
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
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatChipsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="hero-section">
        <div class="hero-icon">
          <mat-icon>casino</mat-icon>
        </div>
        <h1>Random Recipe</h1>
        <p class="subtitle">Can't decide what to make? Let fate choose!</p>
      </div>

      <div class="controls-card">
        <div class="filters">
          <mat-form-field appearance="outline">
            <mat-label>Filter by Category</mat-label>
            <mat-select [(ngModel)]="selectedCategoryIds" multiple>
              @for (category of categories(); track category.id) {
              <mat-option [value]="category.id">{{ category.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Filter by Tags</mat-label>
            <mat-select [(ngModel)]="selectedTagIds" multiple>
              @for (tag of tags(); track tag.id) {
              <mat-option [value]="tag.id">{{ tag.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <button
          mat-fab
          extended
          color="primary"
          (click)="pickRandom()"
          [disabled]="loading()"
          class="spin-btn"
        >
          @if (loading()) {
          <mat-spinner diameter="24"></mat-spinner>
          } @else {
          <mat-icon>casino</mat-icon>
          Spin the Wheel }
        </button>
      </div>

      @if (recipe()) {
      <div class="result-card">
        <div class="result-glow"></div>
        <div class="result-content">
          <h2>{{ recipe()!.title }}</h2>
          @if (recipe()!.description) {
          <p class="result-description">{{ recipe()!.description }}</p>
          }

          <div class="meta-strip">
            @if (recipe()!.prepTimeMinutes) {
            <div class="meta-badge">
              <mat-icon>hourglass_top</mat-icon>
              <span>{{ recipe()!.prepTimeMinutes }} min prep</span>
            </div>
            } @if (recipe()!.cookTimeMinutes) {
            <div class="meta-badge">
              <mat-icon>local_fire_department</mat-icon>
              <span>{{ recipe()!.cookTimeMinutes }} min cook</span>
            </div>
            }
            <div class="meta-badge">
              <mat-icon>people</mat-icon>
              <span>{{ recipe()!.servings }} servings</span>
            </div>
          </div>

          @if (recipe()!.categories.length > 0 || recipe()!.tags.length > 0) {
          <div class="chips-row">
            @for (category of recipe()!.categories; track category.id) {
            <span
              class="chip category-chip"
              [style.background-color]="category.color || '#666'"
            >
              {{ category.name }}
            </span>
            } @for (tag of recipe()!.tags; track tag.id) {
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

          <div class="result-actions">
            <a
              mat-raised-button
              color="primary"
              [routerLink]="['/recipes', recipe()!.id]"
            >
              <mat-icon>restaurant_menu</mat-icon>
              View Recipe
            </a>
            <button mat-button (click)="pickRandom()">
              <mat-icon>refresh</mat-icon>
              Try Again
            </button>
          </div>
        </div>
      </div>
      } @else if (noRecipes()) {
      <div class="empty-state">
        <div class="empty-icon">
          <mat-icon>sentiment_dissatisfied</mat-icon>
        </div>
        <h2>No recipes found</h2>
        <p>
          @if (selectedCategoryIds.length > 0 || selectedTagIds.length > 0) {
          Try removing some filters. } @else { Add some recipes first! }
        </p>
      </div>
      }
    </div>
  `,
  styles: `
    .page-container {
      max-width: 700px;
      margin: 0 auto;
    }

    .hero-section {
      text-align: center;
      margin-bottom: var(--spacing-xl);
    }

    .hero-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto var(--spacing-lg);
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(239, 68, 68, 0.15));
      display: flex;
      align-items: center;
      justify-content: center;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .hero-icon mat-icon {
      font-size: 2.5rem;
      width: 2.5rem;
      height: 2.5rem;
      color: #f97316;
    }

    h1 {
      margin: 0;
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #fafafa, #a1a1aa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      color: rgba(255, 255, 255, 0.5);
      margin: var(--spacing-sm) 0 0;
    }

    .controls-card {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-xl);
      margin-bottom: var(--spacing-xl);
      text-align: center;
    }

    .filters {
      display: flex;
      gap: var(--spacing-md);
      justify-content: center;
      margin-bottom: var(--spacing-lg);
    }

    .filters mat-form-field {
      width: 200px;
    }

    .spin-btn {
      min-width: 200px;
    }

    .result-card {
      position: relative;
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-emphasis);
      border-radius: var(--border-radius-xl);
      padding: var(--spacing-xl);
      overflow: hidden;
      animation: slideIn 0.4s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
    }

    .result-glow {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, #f97316, transparent);
    }

    .result-content h2 {
      margin: 0 0 var(--spacing-sm);
      font-size: 1.5rem;
      font-weight: 600;
    }

    .result-description {
      color: rgba(255, 255, 255, 0.6);
      margin: 0 0 var(--spacing-lg);
    }

    .meta-strip {
      display: flex;
      gap: var(--spacing-md);
      flex-wrap: wrap;
      margin-bottom: var(--spacing-lg);
    }

    .meta-badge {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-sm) var(--spacing-md);
      background: rgba(255, 255, 255, 0.05);
      border-radius: var(--border-radius-sm);
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.7);
    }

    .meta-badge mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      opacity: 0.7;
    }

    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-lg);
    }

    .chip {
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      font-size: 0.8rem;
      font-weight: 500;
    }

    .category-chip {
      color: white;
    }

    .tag-chip {
      background: transparent;
      border: 1px solid;
    }

    .result-actions {
      display: flex;
      gap: var(--spacing-md);
      justify-content: center;
      padding-top: var(--spacing-lg);
      border-top: 1px solid var(--border-subtle);
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
      color: rgba(255, 255, 255, 0.4);
    }

    .empty-state h2 {
      margin: 0 0 var(--spacing-sm);
      font-weight: 600;
    }

    .empty-state p {
      color: rgba(255, 255, 255, 0.5);
      margin: 0;
    }

    @media (max-width: 640px) {
      h1 {
        font-size: 1.75rem;
      }

      .controls-card {
        padding: var(--spacing-md);
      }

      .filters {
        flex-direction: column;
      }

      .filters mat-form-field {
        width: 100%;
      }

      .spin-btn {
        width: 100%;
      }

      .result-card {
        padding: var(--spacing-md);
      }

      .result-content h2 {
        font-size: 1.25rem;
      }

      .meta-strip {
        gap: var(--spacing-sm);
      }

      .meta-badge {
        padding: var(--spacing-xs) var(--spacing-sm);
        font-size: 0.8rem;
      }

      .result-actions {
        flex-direction: column;
        gap: var(--spacing-sm);
      }

      .result-actions a,
      .result-actions button {
        width: 100%;
      }
    }
  `,
})
export class RandomRecipeComponent implements OnInit {
  private readonly api = inject(RecipesApiService);

  loading = signal(false);
  recipe = signal<Recipe | null>(null);
  noRecipes = signal(false);
  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);

  selectedCategoryIds: string[] = [];
  selectedTagIds: string[] = [];

  ngOnInit() {
    this.loadMetadata();
  }

  loadMetadata() {
    Promise.all([
      this.api.getCategories().toPromise(),
      this.api.getTags().toPromise(),
    ]).then(([categories, tags]) => {
      this.categories.set(categories || []);
      this.tags.set(tags || []);
    });
  }

  pickRandom() {
    this.loading.set(true);
    this.noRecipes.set(false);
    this.recipe.set(null);

    this.api
      .getRandomRecipe({
        categoryIds:
          this.selectedCategoryIds.length > 0
            ? this.selectedCategoryIds
            : undefined,
        tagIds:
          this.selectedTagIds.length > 0 ? this.selectedTagIds : undefined,
      })
      .subscribe({
        next: (recipe) => {
          if (recipe) {
            this.recipe.set(recipe);
          } else {
            this.noRecipes.set(true);
          }
          this.loading.set(false);
        },
        error: () => {
          this.noRecipes.set(true);
          this.loading.set(false);
        },
      });
  }
}
