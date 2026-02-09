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
          <button mat-icon-button routerLink="/recipes" class="back-btn">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div class="header-text">
            <h1>{{ recipe()!.title }}</h1>
            @if (recipe()!.description) {
            <p class="description">{{ recipe()!.description }}</p>
            }
          </div>
        </div>
        <div class="header-actions">
          <button
            mat-button
            [routerLink]="['/recipes', recipe()!.id, 'edit']"
            class="action-btn"
          >
            <mat-icon>edit</mat-icon>
            Edit
          </button>
          <button
            mat-button
            color="warn"
            (click)="deleteRecipe()"
            class="action-btn delete-btn"
          >
            <mat-icon>delete</mat-icon>
            Delete
          </button>
        </div>
      </div>

      <div class="meta-strip">
        @if (recipe()!.prepTimeMinutes) {
        <div class="meta-badge prep">
          <mat-icon>hourglass_top</mat-icon>
          <div class="meta-text">
            <span class="meta-value">{{ recipe()!.prepTimeMinutes }}</span>
            <span class="meta-label">min prep</span>
          </div>
        </div>
        } @if (recipe()!.cookTimeMinutes) {
        <div class="meta-badge cook">
          <mat-icon>local_fire_department</mat-icon>
          <div class="meta-text">
            <span class="meta-value">{{ recipe()!.cookTimeMinutes }}</span>
            <span class="meta-label">min cook</span>
          </div>
        </div>
        }
        <div class="meta-badge servings">
          <mat-icon>people</mat-icon>
          <div class="meta-text">
            <span class="meta-value">{{ recipe()!.servings }}</span>
            <span class="meta-label">servings</span>
          </div>
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
        <h2><mat-icon>photo_library</mat-icon> Photos</h2>
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
        <div class="section-card ingredients-section">
          <div class="section-header">
            <h2><mat-icon>format_list_bulleted</mat-icon> Ingredients</h2>
            <div class="servings-adjuster">
              <button
                mat-mini-fab
                (click)="adjustServings(-1)"
                [disabled]="currentServings() <= 1"
                class="adj-btn"
              >
                <mat-icon>remove</mat-icon>
              </button>
              <span class="servings-display">{{ currentServings() }}</span>
              <button mat-mini-fab (click)="adjustServings(1)" class="adj-btn">
                <mat-icon>add</mat-icon>
              </button>
            </div>
          </div>
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
        </div>

        <!-- Instructions -->
        <div class="section-card instructions-section">
          <div class="section-header">
            <h2><mat-icon>menu_book</mat-icon> Instructions</h2>
          </div>
          @if (recipe()!.instructions) {
          <div
            class="instructions-content"
            [innerHTML]="formatInstructions(recipe()!.instructions!)"
          ></div>
          } @else {
          <p class="no-instructions">No instructions provided.</p>
          }
        </div>
      </div>

      @if (recipe()!.notes) {
      <div class="section-card notes-section">
        <div class="section-header">
          <h2><mat-icon>note</mat-icon> Personal Notes</h2>
        </div>
        <p class="notes-content">{{ recipe()!.notes }}</p>
      </div>
      } @if (recipe()!.source) {
      <p class="source">
        <mat-icon>link</mat-icon>
        Source: {{ recipe()!.source }}
      </p>
      }
    </div>
    }
  `,
  styles: `
    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-3xl);
    }

    .recipe-detail {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--spacing-xl);
      gap: var(--spacing-lg);
    }

    .header-content {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-md);
      flex: 1;
    }

    .back-btn {
      margin-top: 4px;
      background: rgba(255, 255, 255, 0.05);
    }

    .header-text h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .description {
      font-size: 1rem;
      color: rgba(255, 255, 255, 0.6);
      margin: var(--spacing-sm) 0 0;
      line-height: 1.5;
    }

    .header-actions {
      display: flex;
      gap: var(--spacing-sm);
      flex-shrink: 0;
    }

    .action-btn {
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-sm);
    }

    .delete-btn:hover {
      background: rgba(239, 68, 68, 0.1);
    }

    .meta-strip {
      display: flex;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-xl);
    }

    .meta-badge {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) var(--spacing-lg);
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-md);
    }

    .meta-badge mat-icon {
      opacity: 0.6;
    }

    .meta-badge.prep mat-icon { color: #3b82f6; opacity: 1; }
    .meta-badge.cook mat-icon { color: #ef4444; opacity: 1; }
    .meta-badge.servings mat-icon { color: #8b5cf6; opacity: 1; }

    .meta-text {
      display: flex;
      flex-direction: column;
    }

    .meta-value {
      font-size: 1.25rem;
      font-weight: 600;
      line-height: 1;
    }

    .meta-label {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-xl);
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

    .photos-section {
      margin-bottom: var(--spacing-xl);
    }

    .photos-section h2 {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
      font-size: 1rem;
      font-weight: 600;
    }

    .photos-section h2 mat-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
      color: #f97316;
    }

    .photos-grid {
      display: flex;
      gap: var(--spacing-md);
      overflow-x: auto;
      padding-bottom: var(--spacing-sm);
    }

    .recipe-photo {
      max-height: 280px;
      border-radius: var(--border-radius-lg);
      object-fit: cover;
      border: 1px solid var(--border-subtle);
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: var(--spacing-xl);
      margin-bottom: var(--spacing-xl);
    }

    @media (max-width: 900px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    .section-card {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-lg);
      padding-bottom: var(--spacing-md);
      border-bottom: 1px solid var(--border-subtle);
    }

    .section-header h2 {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .section-header h2 mat-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
      color: #f97316;
    }

    .servings-adjuster {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .adj-btn {
      width: 32px;
      height: 32px;
      background: rgba(255, 255, 255, 0.05);
    }

    .adj-btn mat-icon {
      font-size: 1rem;
    }

    .servings-display {
      min-width: 2rem;
      text-align: center;
      font-weight: 600;
      font-size: 1.125rem;
    }

    .ingredients-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .ingredients-list li {
      display: flex;
      align-items: baseline;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .ingredients-list li:last-child {
      border-bottom: none;
    }

    .quantity {
      font-weight: 600;
      color: #f97316;
      min-width: 50px;
    }

    .unit {
      color: rgba(255, 255, 255, 0.5);
      min-width: 40px;
    }

    .name {
      flex: 1;
    }

    .notes {
      color: rgba(255, 255, 255, 0.5);
      font-style: italic;
      font-size: 0.875rem;
    }

    .instructions-content {
      line-height: 1.8;
      white-space: pre-wrap;
      color: rgba(255, 255, 255, 0.85);
    }

    .no-instructions {
      color: rgba(255, 255, 255, 0.4);
      font-style: italic;
    }

    .notes-section {
      margin-bottom: var(--spacing-xl);
    }

    .notes-content {
      margin: 0;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.75);
    }

    .source {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.875rem;
    }

    .source mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }

    @media (max-width: 640px) {
      .header {
        flex-direction: column;
      }

      .header-text h1 {
        font-size: 1.5rem;
      }

      .header-actions {
        width: 100%;
      }

      .header-actions button {
        flex: 1;
      }

      .meta-strip {
        flex-wrap: wrap;
      }

      .meta-badge {
        flex: 1;
        min-width: 100px;
        padding: var(--spacing-sm) var(--spacing-md);
      }

      .meta-value {
        font-size: 1.1rem;
      }

      .section-card {
        padding: var(--spacing-md);
      }

      .section-header {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--spacing-sm);
        padding-bottom: var(--spacing-sm);
        margin-bottom: var(--spacing-md);
      }

      .ingredients-list li {
        flex-wrap: wrap;
      }

      .quantity {
        min-width: 40px;
      }

      .unit {
        min-width: 35px;
      }

      .photos-grid {
        gap: var(--spacing-sm);
      }

      .recipe-photo {
        max-height: 200px;
      }
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
