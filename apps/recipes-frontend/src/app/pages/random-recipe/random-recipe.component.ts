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
      <h1>Random Recipe</h1>
      <p class="subtitle">Can't decide what to make? Let fate choose!</p>

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

        <button
          mat-raised-button
          color="primary"
          (click)="pickRandom()"
          [disabled]="loading()"
        >
          @if (loading()) {
          <mat-spinner diameter="20"></mat-spinner>
          } @else {
          <ng-container
            ><mat-icon>casino</mat-icon> Pick Random Recipe</ng-container
          >
          }
        </button>
      </div>

      @if (recipe()) {
      <mat-card class="recipe-card">
        <mat-card-header>
          <mat-card-title>{{ recipe()!.title }}</mat-card-title>
          @if (recipe()!.description) {
          <mat-card-subtitle>{{ recipe()!.description }}</mat-card-subtitle>
          }
        </mat-card-header>

        <mat-card-content>
          <div class="meta-row">
            @if (recipe()!.prepTimeMinutes) {
            <div class="meta-item">
              <mat-icon>hourglass_top</mat-icon>
              <span>{{ recipe()!.prepTimeMinutes }} min prep</span>
            </div>
            } @if (recipe()!.cookTimeMinutes) {
            <div class="meta-item">
              <mat-icon>local_fire_department</mat-icon>
              <span>{{ recipe()!.cookTimeMinutes }} min cook</span>
            </div>
            }
            <div class="meta-item">
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
        </mat-card-content>

        <mat-card-actions>
          <a
            mat-raised-button
            color="primary"
            [routerLink]="['/recipes', recipe()!.id]"
          >
            <mat-icon>restaurant_menu</mat-icon>
            View Full Recipe
          </a>
          <button mat-button (click)="pickRandom()">
            <mat-icon>refresh</mat-icon>
            Try Again
          </button>
        </mat-card-actions>
      </mat-card>
      } @else if (noRecipes()) {
      <div class="empty-state">
        <mat-icon>sentiment_dissatisfied</mat-icon>
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
      max-width: 800px;
      margin: 0 auto;
      text-align: center;
    }

    h1 {
      margin: 0;
      font-size: 2.5rem;
    }

    .subtitle {
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: var(--spacing-xl);
    }

    .filters {
      display: flex;
      gap: var(--spacing-md);
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: var(--spacing-xl);
    }

    .filters mat-form-field {
      width: 200px;
    }

    .recipe-card {
      text-align: left;
      max-width: 600px;
      margin: 0 auto;
    }

    .meta-row {
      display: flex;
      gap: var(--spacing-xl);
      margin-bottom: var(--spacing-lg);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      color: var(--mat-sys-on-surface-variant);
    }

    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .chip {
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.875rem;
    }

    .category-chip {
      color: white;
    }

    .tag-chip {
      background: transparent;
      border: 1px solid;
    }

    .empty-state {
      padding: var(--spacing-3xl);
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-state mat-icon {
      font-size: 4rem;
      width: 4rem;
      height: 4rem;
      margin-bottom: var(--spacing-md);
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
