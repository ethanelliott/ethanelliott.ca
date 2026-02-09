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
      <div class="page-header">
        <div class="header-text">
          <h1>Grocery List</h1>
          <p class="subtitle">Generate a shopping list from your recipes</p>
        </div>
      </div>

      @if (loading()) {
      <div class="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
      } @else {
      <div class="content-grid">
        <!-- Recipe Selection -->
        <div class="section-card">
          <div class="section-header">
            <h2><mat-icon>menu_book</mat-icon> Select Recipes</h2>
          </div>
          <div class="section-body">
            @if (recipeSelections().length === 0) {
            <p class="empty-message">
              No recipes available.
              <a routerLink="/recipes/new">Add some recipes</a> first!
            </p>
            } @else {
            <div class="recipe-selection-list">
              @for (selection of recipeSelections(); track selection.recipe.id)
              {
              <div
                class="recipe-selection-item"
                [class.selected]="selection.selected"
              >
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
          </div>
          <div class="section-actions">
            <button
              mat-fab
              extended
              color="primary"
              (click)="generateList()"
              [disabled]="!hasSelection() || generating()"
            >
              @if (generating()) {
              <mat-spinner diameter="24"></mat-spinner>
              } @else {
              <mat-icon>shopping_cart</mat-icon>
              Generate List }
            </button>
          </div>
        </div>

        <!-- Generated List -->
        <div class="section-card list-card">
          <div class="section-header">
            <h2><mat-icon>checklist</mat-icon> Shopping List</h2>
            @if (groceryList()) {
            <span class="list-summary">
              {{ groceryList()!.recipeCount }} recipes •
              {{ groceryList()!.totalServings }} servings
            </span>
            }
          </div>
          <div class="section-body">
            @if (!groceryList()) {
            <div class="empty-list-state">
              <mat-icon>shopping_basket</mat-icon>
              <p>
                Select recipes and generate a list to see your groceries here.
              </p>
            </div>
            } @else if (groceryList()!.items.length === 0) {
            <p class="empty-message">
              No ingredients found for the selected recipes.
            </p>
            } @else {
            <div class="grocery-items">
              @for (item of groceryList()!.items; track item.name + item.unit) {
              <div
                class="grocery-item"
                [class.checked]="checkedItems[item.name + item.unit]"
              >
                <mat-checkbox [(ngModel)]="checkedItems[item.name + item.unit]">
                  <span class="item-content">
                    <span class="quantity">{{
                      formatQuantity(item.quantity)
                    }}</span>
                    <span class="unit">{{ item.unit }}</span>
                    <span class="name">{{ item.name }}</span>
                  </span>
                </mat-checkbox>
                <span class="recipes-used">{{ item.recipes.join(', ') }}</span>
              </div>
              }
            </div>
            }
          </div>
          @if (groceryList() && groceryList()!.items.length > 0) {
          <div class="section-actions">
            <button mat-button (click)="copyToClipboard()">
              <mat-icon>content_copy</mat-icon>
              Copy
            </button>
            <button mat-button (click)="clearChecked()">
              <mat-icon>clear_all</mat-icon>
              Uncheck All
            </button>
          </div>
          }
        </div>
      </div>
      }
    </div>
  `,
  styles: `
    .page-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: var(--spacing-xl);
    }

    .header-text h1 {
      margin: 0;
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .subtitle {
      margin: var(--spacing-xs) 0 0;
      color: rgba(255, 255, 255, 0.5);
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-3xl);
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-xl);
    }

    @media (max-width: 900px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .header-text h1 {
        font-size: 1.75rem;
      }

      .section-header {
        padding: var(--spacing-md);
        flex-wrap: wrap;
        gap: var(--spacing-xs);
      }

      .section-body {
        padding: var(--spacing-md);
        max-height: 350px;
      }

      .section-actions {
        padding: var(--spacing-sm) var(--spacing-md);
        flex-wrap: wrap;
      }

      .recipe-selection-item {
        flex-wrap: wrap;
      }

      .servings-field {
        width: 80px;
      }
    }

    .section-card {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
      display: flex;
      flex-direction: column;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-lg);
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

    .list-summary {
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.8rem;
    }

    .section-body {
      flex: 1;
      padding: var(--spacing-lg);
      overflow-y: auto;
      max-height: 450px;
    }

    .section-actions {
      padding: var(--spacing-md) var(--spacing-lg);
      border-top: 1px solid var(--border-subtle);
      display: flex;
      gap: var(--spacing-sm);
    }

    .empty-message {
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
    }

    .empty-message a {
      color: #f97316;
    }

    .empty-list-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--spacing-xl);
      text-align: center;
    }

    .empty-list-state mat-icon {
      font-size: 3rem;
      width: 3rem;
      height: 3rem;
      color: rgba(255, 255, 255, 0.2);
      margin-bottom: var(--spacing-md);
    }

    .empty-list-state p {
      color: rgba(255, 255, 255, 0.5);
      margin: 0;
    }

    .recipe-selection-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .recipe-selection-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius-sm);
      transition: background 0.2s ease;
    }

    .recipe-selection-item:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .recipe-selection-item.selected {
      background: rgba(249, 115, 22, 0.08);
    }

    .servings-field {
      width: 90px;
      margin-left: auto;
    }

    .grocery-items {
      display: flex;
      flex-direction: column;
    }

    .grocery-item {
      display: flex;
      flex-direction: column;
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--border-subtle);
      transition: opacity 0.2s ease;
    }

    .grocery-item:last-child {
      border-bottom: none;
    }

    .grocery-item.checked {
      opacity: 0.5;
    }

    .grocery-item.checked .item-content {
      text-decoration: line-through;
    }

    .item-content {
      display: flex;
      gap: var(--spacing-sm);
    }

    .item-content .quantity {
      font-weight: 600;
      color: #f97316;
      min-width: 45px;
    }

    .item-content .unit {
      color: rgba(255, 255, 255, 0.5);
      min-width: 40px;
    }

    .recipes-used {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.4);
      margin-left: 28px;
      margin-top: 2px;
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
