import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import {
  RecipesApiService,
  Recipe,
  Ingredient,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-recipe-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatDialogModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
    <div class="loading">
      <mat-spinner diameter="48"></mat-spinner>
    </div>
    } @else if (recipe()) {
    <div class="recipe-detail">
      <div class="header">
        <div class="header-content">
          <button mat-icon-button routerLink="/recipes">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1>{{ recipe()!.title }}</h1>
        </div>
        <div class="header-actions">
          <button mat-button [routerLink]="['/recipes', recipe()!.id, 'edit']">
            <mat-icon>edit</mat-icon>
            Edit
          </button>
          <button mat-button color="warn" (click)="deleteRecipe()">
            <mat-icon>delete</mat-icon>
            Delete
          </button>
        </div>
      </div>

      @if (recipe()!.description) {
      <p class="description">{{ recipe()!.description }}</p>
      }

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

      <!-- Photos -->
      @if (recipe()!.photos && recipe()!.photos!.length > 0) {
      <div class="photos-section">
        <h2>Photos</h2>
        <div class="photos-grid">
          @for (photo of recipe()!.photos; track photo.id) {
          <img
            [src]="getPhotoUrl(photo.id)"
            [alt]="photo.filename"
            class="recipe-photo"
          />
          }
        </div>
      </div>
      }

      <div class="content-grid">
        <!-- Ingredients -->
        <mat-card class="ingredients-card">
          <mat-card-header>
            <mat-card-title>Ingredients</mat-card-title>
            <div class="servings-adjuster">
              <button
                mat-icon-button
                (click)="adjustServings(-1)"
                [disabled]="currentServings() <= 1"
              >
                <mat-icon>remove</mat-icon>
              </button>
              <span class="servings-display">{{ currentServings() }}</span>
              <button mat-icon-button (click)="adjustServings(1)">
                <mat-icon>add</mat-icon>
              </button>
            </div>
          </mat-card-header>
          <mat-card-content>
            <ul class="ingredients-list">
              @for (ingredient of scaledIngredients(); track ingredient.id) {
              <li>
                <span class="quantity">{{
                  formatQuantity(ingredient.quantity)
                }}</span>
                <span class="unit">{{ ingredient.unit }}</span>
                <span class="name">{{ ingredient.name }}</span>
                @if (ingredient.notes) {
                <span class="notes">({{ ingredient.notes }})</span>
                }
              </li>
              }
            </ul>
          </mat-card-content>
        </mat-card>

        <!-- Instructions -->
        <mat-card class="instructions-card">
          <mat-card-header>
            <mat-card-title>Instructions</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (recipe()!.instructions) {
            <div
              class="instructions"
              [innerHTML]="formatInstructions(recipe()!.instructions!)"
            ></div>
            } @else {
            <p class="no-instructions">No instructions provided.</p>
            }
          </mat-card-content>
        </mat-card>
      </div>

      @if (recipe()!.notes) {
      <mat-card class="notes-card">
        <mat-card-header>
          <mat-card-title>Personal Notes</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p>{{ recipe()!.notes }}</p>
        </mat-card-content>
      </mat-card>
      } @if (recipe()!.source) {
      <p class="source">Source: {{ recipe()!.source }}</p>
      }
    </div>
    }
  `,
  styles: `
    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-2xl);
    }

    .recipe-detail {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-lg);
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    h1 {
      margin: 0;
      font-size: 2rem;
    }

    .header-actions {
      display: flex;
      gap: var(--spacing-sm);
    }

    .description {
      font-size: 1.125rem;
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: var(--spacing-lg);
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
      margin-bottom: var(--spacing-lg);
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

    .photos-section {
      margin-bottom: var(--spacing-lg);
    }

    .photos-section h2 {
      margin-bottom: var(--spacing-md);
    }

    .photos-grid {
      display: flex;
      gap: var(--spacing-md);
      overflow-x: auto;
      padding-bottom: var(--spacing-sm);
    }

    .recipe-photo {
      max-height: 300px;
      border-radius: var(--border-radius-md);
      object-fit: cover;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: var(--spacing-lg);
      margin-bottom: var(--spacing-lg);
    }

    @media (max-width: 768px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    .ingredients-card mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .servings-adjuster {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .servings-display {
      min-width: 2rem;
      text-align: center;
      font-weight: 500;
    }

    .ingredients-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .ingredients-list li {
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .ingredients-list li:last-child {
      border-bottom: none;
    }

    .quantity {
      font-weight: 500;
      margin-right: var(--spacing-xs);
    }

    .unit {
      color: var(--mat-sys-on-surface-variant);
      margin-right: var(--spacing-sm);
    }

    .notes {
      color: var(--mat-sys-on-surface-variant);
      font-style: italic;
      margin-left: var(--spacing-xs);
    }

    .instructions {
      line-height: 1.8;
      white-space: pre-wrap;
    }

    .no-instructions {
      color: var(--mat-sys-on-surface-variant);
      font-style: italic;
    }

    .notes-card {
      margin-bottom: var(--spacing-lg);
    }

    .source {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }
  `,
})
export class RecipeDetailComponent implements OnInit {
  private readonly api = inject(RecipesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  loading = signal(true);
  recipe = signal<Recipe | null>(null);
  currentServings = signal(4);
  scaledIngredients = signal<Ingredient[]>([]);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadRecipe(id);
    }
  }

  loadRecipe(id: string) {
    this.loading.set(true);
    this.api.getRecipe(id).subscribe({
      next: (recipe) => {
        this.recipe.set(recipe);
        this.currentServings.set(recipe.servings);
        this.scaledIngredients.set(recipe.ingredients);
        this.loading.set(false);
      },
      error: () => {
        this.router.navigate(['/recipes']);
      },
    });
  }

  adjustServings(delta: number) {
    const newServings = this.currentServings() + delta;
    if (newServings < 1) return;

    this.currentServings.set(newServings);

    const recipe = this.recipe();
    if (recipe) {
      this.api.getScaledIngredients(recipe.id, newServings).subscribe({
        next: (ingredients) => {
          this.scaledIngredients.set(ingredients);
        },
      });
    }
  }

  formatQuantity(quantity: number): string {
    // Round to reasonable precision
    if (quantity === Math.floor(quantity)) {
      return quantity.toString();
    }
    return quantity.toFixed(2).replace(/\.?0+$/, '');
  }

  formatInstructions(instructions: string): string {
    // Convert newlines to <br> tags
    return instructions.replace(/\n/g, '<br>');
  }

  getPhotoUrl(photoId: string): string {
    return this.api.getPhotoUrl(photoId);
  }

  deleteRecipe() {
    const recipe = this.recipe();
    if (!recipe) return;

    if (confirm(`Are you sure you want to delete "${recipe.title}"?`)) {
      this.api.deleteRecipe(recipe.id).subscribe({
        next: () => {
          this.router.navigate(['/recipes']);
        },
      });
    }
  }
}
