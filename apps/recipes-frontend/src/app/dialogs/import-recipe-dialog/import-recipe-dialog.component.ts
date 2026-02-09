import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { RecipesApiService, ParsedRecipe } from '../../services/recipes-api.service';

@Component({
  selector: 'app-import-recipe-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">auto_fix_high</mat-icon>
      Import Recipe with AI
    </h2>

    <mat-dialog-content>
      @if (!parsedRecipe()) {
      <div class="import-intro">
        <p>Paste a recipe from any source and our AI will automatically extract and structure it for you.</p>
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Paste recipe text here</mat-label>
        <textarea
          matInput
          [ngModel]="recipeText()"
          (ngModelChange)="recipeText.set($event)"
          rows="12"
          placeholder="Paste your recipe text here. Include ingredients, instructions, and any other details..."
          [disabled]="loading()"
        ></textarea>
        <mat-hint>Supports most recipe formats - ingredients list, instructions, cook times, etc.</mat-hint>
      </mat-form-field>
      } @else {
      <div class="parsed-preview">
        <div class="preview-header">
          <mat-icon class="success-icon">check_circle</mat-icon>
          <span>Recipe Parsed Successfully!</span>
        </div>

        <div class="preview-content">
          <h3>{{ parsedRecipe()!.title }}</h3>

          @if (parsedRecipe()!.description) {
          <p class="description">{{ parsedRecipe()!.description }}</p>
          }

          <div class="preview-section">
            <h4>Ingredients ({{ parsedRecipe()!.ingredients.length }})</h4>
            <ul>
              @for (ing of parsedRecipe()!.ingredients.slice(0, 5); track $index) {
              <li>{{ formatIngredient(ing) }}</li>
              }
              @if (parsedRecipe()!.ingredients.length > 5) {
              <li class="more">... and {{ parsedRecipe()!.ingredients.length - 5 }} more</li>
              }
            </ul>
          </div>

          <div class="preview-section">
            <h4>Instructions</h4>
            <p class="instructions-preview">
              {{ parsedRecipe()!.instructions.substring(0, 200) }}
              @if (parsedRecipe()!.instructions.length > 200) { ... }
            </p>
          </div>

@if (parsedRecipe()!.prepTimeMinutes || parsedRecipe()!.cookTimeMinutes || parsedRecipe()!.servings) {
          <div class="preview-meta">
            @if (parsedRecipe()!.prepTimeMinutes) {
            <span><mat-icon>schedule</mat-icon> Prep: {{ parsedRecipe()!.prepTimeMinutes }} min</span>
            }
            @if (parsedRecipe()!.cookTimeMinutes) {
            <span><mat-icon>timer</mat-icon> Cook: {{ parsedRecipe()!.cookTimeMinutes }} min</span>
            }
            @if (parsedRecipe()!.servings) {
            <span><mat-icon>restaurant</mat-icon> Serves {{ parsedRecipe()!.servings }}</span>
            }
          </div>
          }
        </div>
      </div>
      }

      @if (error()) {
      <div class="error-message">
        <mat-icon>error_outline</mat-icon>
        {{ error() }}
      </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()" [disabled]="loading()">Cancel</button>

      @if (!parsedRecipe()) {
      <button
        mat-raised-button
        color="primary"
        (click)="parseRecipe()"
        [disabled]="!recipeText().trim() || loading()"
      >
        @if (loading()) {
        <mat-spinner diameter="20"></mat-spinner>
        Parsing...
        } @else {
        <mat-icon>auto_fix_high</mat-icon>
        Parse Recipe
        }
      </button>
      } @else {
      <button mat-button (click)="reset()">
        <mat-icon>arrow_back</mat-icon>
        Try Again
      </button>
      <button mat-raised-button color="primary" (click)="createRecipe()">
        <mat-icon>add</mat-icon>
        Create Recipe
      </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: #fafafa;
    }

    .title-icon {
      color: #f97316;
    }

    mat-dialog-content {
      min-width: 400px;
      max-width: 600px;
      padding-top: 16px !important;
    }

    .import-intro {
      margin-bottom: 16px;
    }

    .import-intro p {
      margin: 0;
      color: rgba(255, 255, 255, 0.7);
    }

    .full-width {
      width: 100%;
    }

    textarea {
      font-family: inherit;
      line-height: 1.5;
    }

    .parsed-preview {
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      padding: 16px;
    }

    .preview-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      font-weight: 500;
      color: #22c55e;
    }

    .success-icon {
      color: #22c55e;
    }

    .preview-content h3 {
      margin: 0 0 8px;
      font-size: 1.25rem;
      color: #fafafa;
    }

    .description {
      color: rgba(255, 255, 255, 0.7);
      margin: 0 0 16px;
    }

    .preview-section {
      margin-bottom: 16px;
    }

    .preview-section h4 {
      margin: 0 0 8px;
      font-size: 0.875rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
    }

    .preview-section ul {
      margin: 0;
      padding-left: 20px;
    }

    .preview-section li {
      padding: 4px 0;
      color: rgba(255, 255, 255, 0.8);
    }

    .preview-section li.more {
      color: rgba(255, 255, 255, 0.5);
      font-style: italic;
    }

    .instructions-preview {
      color: rgba(255, 255, 255, 0.7);
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.6;
    }

    .preview-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .preview-meta span {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.7);
    }

    .preview-meta mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      color: #f97316;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      margin-top: 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #ef4444;
    }

    mat-dialog-actions {
      padding: 16px 24px !important;
      gap: 8px;
    }

    button mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }

    @media (max-width: 640px) {
      mat-dialog-content {
        min-width: unset;
      }
    }
  `,
})
export class ImportRecipeDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ImportRecipeDialogComponent>);
  private readonly api = inject(RecipesApiService);
  private readonly router = inject(Router);

  recipeText = signal('');
  loading = signal(false);
  error = signal('');
  parsedRecipe = signal<ParsedRecipe | null>(null);

  parseRecipe() {
    const text = this.recipeText().trim();
    if (!text) return;

    this.loading.set(true);
    this.error.set('');

    this.api.parseRecipeFromText(text).subscribe({
      next: (parsed) => {
        this.parsedRecipe.set(parsed);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to parse recipe. Please try again.');
        this.loading.set(false);
      },
    });
  }

  reset() {
    this.parsedRecipe.set(null);
    this.error.set('');
  }

  createRecipe() {
    const parsed = this.parsedRecipe();
    if (!parsed) return;

    // Create the recipe via API
    this.loading.set(true);
    this.api
      .createRecipe({
        title: parsed.title,
        description: parsed.description || '',
        instructions: parsed.instructions,
        prepTimeMinutes: parsed.prepTimeMinutes || 0,
        cookTimeMinutes: parsed.cookTimeMinutes || 0,
        servings: parsed.servings || 4,
        source: 'Imported via AI',
        ingredients: parsed.ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes || '',
        })),
        categoryIds: [],
        tagIds: [],
      })
      .subscribe({
        next: (recipe) => {
          this.loading.set(false);
          this.dialogRef.close();
          // Navigate to the new recipe
          this.router.navigate(['/recipes', recipe.id]);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to create recipe.');
          this.loading.set(false);
        },
      });
  }

  formatIngredient(ing: { name: string; quantity: number; unit: string; notes?: string }): string {
    let result = '';
    if (ing.quantity) {
      result += `${ing.quantity} `;
    }
    if (ing.unit) {
      result += `${ing.unit} `;
    }
    result += ing.name;
    if (ing.notes) {
      result += ` (${ing.notes})`;
    }
    return result;
  }
}
