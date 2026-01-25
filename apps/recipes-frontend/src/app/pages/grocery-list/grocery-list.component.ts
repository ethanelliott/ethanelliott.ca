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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import {
  RecipesApiService,
  RecipeSummary,
  GroceryList,
} from '../../services/recipes-api.service';

interface RecipeSelection {
  recipe: RecipeSummary;
  selected: boolean;
  servings: number;
}

@Component({
  selector: 'app-grocery-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h1>Grocery List Generator</h1>

      @if (loading()) {
      <div class="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
      } @else {
      <div class="content-grid">
        <!-- Recipe Selection -->
        <mat-card class="selection-card">
          <mat-card-header>
            <mat-card-title>Select Recipes</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (recipeSelections().length === 0) {
            <p class="empty-message">
              No recipes available.
              <a routerLink="/recipes/new">Add some recipes</a> first!
            </p>
            } @else {
            <div class="recipe-selection-list">
              @for (selection of recipeSelections(); track selection.recipe.id)
              {
              <div class="recipe-selection-item">
                <mat-checkbox
                  [(ngModel)]="selection.selected"
                  (ngModelChange)="onSelectionChange()"
                >
                  {{ selection.recipe.title }}
                </mat-checkbox>
                @if (selection.selected) {
                <mat-form-field appearance="outline" class="servings-field">
                  <mat-label>Servings</mat-label>
                  <input
                    matInput
                    type="number"
                    [(ngModel)]="selection.servings"
                    min="1"
                    (ngModelChange)="onSelectionChange()"
                  />
                </mat-form-field>
                }
              </div>
              }
            </div>
            }
          </mat-card-content>
          <mat-card-actions>
            <button
              mat-raised-button
              color="primary"
              (click)="generateList()"
              [disabled]="!hasSelection() || generating()"
            >
              @if (generating()) {
              <mat-spinner diameter="20"></mat-spinner>
              } @else {
              <ng-container
                ><mat-icon>shopping_cart</mat-icon> Generate List</ng-container
              >
              }
            </button>
          </mat-card-actions>
        </mat-card>

        <!-- Generated List -->
        <mat-card class="list-card">
          <mat-card-header>
            <mat-card-title>Grocery List</mat-card-title>
            @if (groceryList()) {
            <span class="list-summary">
              {{ groceryList()!.recipeCount }} recipes •
              {{ groceryList()!.totalServings }} servings
            </span>
            }
          </mat-card-header>
          <mat-card-content>
            @if (!groceryList()) {
            <p class="empty-message">
              Select recipes and generate a list to see your groceries here.
            </p>
            } @else if (groceryList()!.items.length === 0) {
            <p class="empty-message">
              No ingredients found for the selected recipes.
            </p>
            } @else {
            <div class="grocery-items">
              @for (item of groceryList()!.items; track item.name + item.unit) {
              <div class="grocery-item">
                <mat-checkbox [(ngModel)]="checkedItems[item.name + item.unit]">
                  <span class="quantity"
                    >{{ formatQuantity(item.quantity) }} {{ item.unit }}</span
                  >
                  <span class="name">{{ item.name }}</span>
                </mat-checkbox>
                <span class="recipes-used">{{ item.recipes.join(', ') }}</span>
              </div>
              }
            </div>
            }
          </mat-card-content>
          @if (groceryList() && groceryList()!.items.length > 0) {
          <mat-card-actions>
            <button mat-button (click)="copyToClipboard()">
              <mat-icon>content_copy</mat-icon>
              Copy to Clipboard
            </button>
            <button mat-button (click)="clearChecked()">
              <mat-icon>clear_all</mat-icon>
              Clear Checked
            </button>
          </mat-card-actions>
          }
        </mat-card>
      </div>
      }
    </div>
  `,
  styles: `
    .page-container {
      max-width: 1400px;
      margin: 0 auto;
    }

    h1 {
      margin: 0 0 var(--spacing-lg);
      font-size: 2rem;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-2xl);
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-lg);
    }

    @media (max-width: 900px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .list-summary {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    .empty-message {
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
      padding: var(--spacing-lg);
    }

    .recipe-selection-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .recipe-selection-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .recipe-selection-item:last-child {
      border-bottom: none;
    }

    .servings-field {
      width: 100px;
    }

    .grocery-items {
      max-height: 500px;
      overflow-y: auto;
    }

    .grocery-item {
      display: flex;
      flex-direction: column;
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .grocery-item:last-child {
      border-bottom: none;
    }

    .grocery-item .quantity {
      font-weight: 500;
      margin-right: var(--spacing-sm);
    }

    .recipes-used {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      margin-left: 28px;
    }
  `,
})
export class GroceryListComponent implements OnInit {
  private readonly api = inject(RecipesApiService);

  loading = signal(true);
  generating = signal(false);
  recipeSelections = signal<RecipeSelection[]>([]);
  groceryList = signal<GroceryList | null>(null);
  checkedItems: Record<string, boolean> = {};

  ngOnInit() {
    this.loadRecipes();
  }

  loadRecipes() {
    this.loading.set(true);
    this.api.getRecipes().subscribe({
      next: (recipes) => {
        this.recipeSelections.set(
          recipes.map((recipe) => ({
            recipe,
            selected: false,
            servings: recipe.servings,
          }))
        );
        this.loading.set(false);
      },
    });
  }

  hasSelection(): boolean {
    return this.recipeSelections().some((s) => s.selected);
  }

  onSelectionChange() {
    // Optionally auto-generate or just update state
  }

  generateList() {
    const selected = this.recipeSelections().filter((s) => s.selected);
    if (selected.length === 0) return;

    this.generating.set(true);
    this.checkedItems = {};

    this.api
      .generateGroceryList({
        recipes: selected.map((s) => ({
          recipeId: s.recipe.id,
          servings: s.servings,
        })),
      })
      .subscribe({
        next: (list) => {
          this.groceryList.set(list);
          this.generating.set(false);
        },
        error: () => {
          this.generating.set(false);
        },
      });
  }

  formatQuantity(quantity: number): string {
    if (quantity === Math.floor(quantity)) {
      return quantity.toString();
    }
    return quantity.toFixed(2).replace(/\.?0+$/, '');
  }

  copyToClipboard() {
    const list = this.groceryList();
    if (!list) return;

    const text = list.items
      .filter((item) => !this.checkedItems[item.name + item.unit])
      .map(
        (item) =>
          `${this.formatQuantity(item.quantity)} ${item.unit} ${item.name}`
      )
      .join('\n');

    navigator.clipboard.writeText(text);
  }

  clearChecked() {
    this.checkedItems = {};
  }
}
