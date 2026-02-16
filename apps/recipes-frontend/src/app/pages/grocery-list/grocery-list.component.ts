import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {
  RecipesApiService,
  RecipeSummary,
  GroceryList,
  GroceryItem,
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
    FormsModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    InputNumberModule,
    ProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grocery-page">
      <div class="page-header">
        <h1>Grocery List</h1>
        <p class="subtitle">Select recipes and generate a shopping list</p>
      </div>

      @if (loadingRecipes()) {
      <div class="loading-container">
        <p-progress-spinner ariaLabel="Loading" />
      </div>
      } @else {
      <div class="grocery-layout">
        <!-- Recipe Selection Panel -->
        <p-card header="Select Recipes" styleClass="panel-card">
          @if (recipeSelections().length === 0) {
          <p class="empty-msg">No recipes available.</p>
          } @else {
          <div class="recipe-selection-list">
            @for (sel of recipeSelections(); track sel.recipe.id) {
            <div class="recipe-selection-row">
              <p-checkbox [(ngModel)]="sel.selected" [binary]="true" />
              <label>{{ sel.recipe.title }}</label>
              @if (sel.selected) {
              <div class="servings-input">
                <span class="servings-label">×</span>
                <p-inputnumber
                  [(ngModel)]="sel.servings"
                  [min]="1"
                  [showButtons]="true"
                  size="small"
                />
              </div>
              }
            </div>
            }
          </div>
          <div class="generate-action">
            <p-button
              label="Generate List"
              icon="pi pi-list"
              (click)="generate()"
              [loading]="generating()"
              [disabled]="selectedCount() === 0"
            />
          </div>
          }
        </p-card>

        <!-- Shopping List Panel -->
        <p-card header="Shopping List" styleClass="panel-card">
          @if (!groceryList()) {
          <div class="empty-list">
            <i class="pi pi-shopping-cart"></i>
            <p>Select recipes and generate to see your list</p>
          </div>
          } @else {
          <div class="list-summary">
            {{ groceryList()!.recipeCount }} recipe(s) &middot;
            {{ groceryList()!.totalServings }} total servings
          </div>

          <div class="grocery-items">
            @for (item of checkedItems(); track item.name) {
            <div class="grocery-item" [class.checked]="item.checked">
              <p-checkbox [(ngModel)]="item.checked" [binary]="true" />
              <div class="item-info">
                <span class="item-text">
                  {{ item.quantity }} {{ item.unit }} {{ item.name }}
                </span>
                <small class="item-recipes">
                  {{ item.recipes.join(', ') }}
                </small>
              </div>
            </div>
            }
          </div>

          <div class="list-actions">
            <p-button
              label="Copy Unchecked"
              icon="pi pi-copy"
              severity="secondary"
              [outlined]="true"
              (click)="copyToClipboard()"
            />
            <p-button
              label="Uncheck All"
              icon="pi pi-refresh"
              severity="secondary"
              [text]="true"
              (click)="uncheckAll()"
            />
          </div>
          }
        </p-card>
      </div>
      }
    </div>
  `,
  styles: `
    .grocery-page {
      max-width: 1100px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 24px;

      h1 {
        margin: 0 0 4px;
        font-size: 1.5rem;
        font-weight: 700;
      }

      .subtitle {
        margin: 0;
        color: var(--p-text-muted-color);
        font-size: 0.9rem;
      }
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 64px 0;
    }

    .grocery-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    :host ::ng-deep .panel-card {
      height: fit-content;
    }

    .empty-msg {
      color: var(--p-text-muted-color);
      text-align: center;
      margin: 0;
    }

    .recipe-selection-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 500px;
      overflow-y: auto;
    }

    .recipe-selection-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px;
      border-radius: 8px;
      transition: background 0.15s;

      &:hover {
        background: var(--p-surface-700);
      }
    }

    .servings-input {
      display: flex;
      align-items: center;
      gap: 4px;

      .servings-label {
        color: var(--p-text-muted-color);
        font-size: 0.85rem;
      }

      p-inputnumber {
        width: 80px;
      }
    }

    .generate-action {
      margin-top: 16px;
      display: flex;
      justify-content: center;
    }

    .empty-list {
      text-align: center;
      padding: 32px 0;
      color: var(--p-text-muted-color);

      i {
        font-size: 2.5rem;
        margin-bottom: 12px;
      }
    }

    .list-summary {
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--p-surface-700);
    }

    .grocery-items {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 500px;
      overflow-y: auto;
    }

    .grocery-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px;
      border-radius: 8px;
      transition: opacity 0.2s;

      &.checked {
        opacity: 0.4;

        .item-text {
          text-decoration: line-through;
        }
      }
    }

    .item-info {
      display: flex;
      flex-direction: column;
    }

    .item-text {
      font-size: 0.95rem;
    }

    .item-recipes {
      color: var(--p-text-muted-color);
      font-size: 0.75rem;
    }

    .list-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--p-surface-700);
    }

    @media (max-width: 768px) {
      .grocery-layout {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class GroceryListComponent implements OnInit {
  private api = inject(RecipesApiService);

  loadingRecipes = signal(true);
  generating = signal(false);
  recipeSelections = signal<RecipeSelection[]>([]);
  groceryList = signal<GroceryList | null>(null);
  checkedItems = signal<Array<GroceryItem & { checked: boolean }>>([]);

  selectedCount = signal(0);

  ngOnInit() {
    this.api.getRecipes().subscribe((recipes) => {
      this.recipeSelections.set(
        recipes.map((r) => ({
          recipe: r,
          selected: false,
          servings: r.servings,
        }))
      );
      this.loadingRecipes.set(false);
    });
  }

  generate() {
    const selected = this.recipeSelections().filter((s) => s.selected);
    if (selected.length === 0) return;

    this.generating.set(true);
    this.api
      .generateGroceryList({
        recipes: selected.map((s) => ({
          recipeId: s.recipe.id,
          servings: s.servings,
        })),
      })
      .subscribe((list) => {
        this.groceryList.set(list);
        this.checkedItems.set(
          list.items.map((item) => ({ ...item, checked: false }))
        );
        this.generating.set(false);
      });
  }

  copyToClipboard() {
    const unchecked = this.checkedItems().filter((i) => !i.checked);
    const text = unchecked
      .map((i) => `${i.quantity} ${i.unit} ${i.name}`)
      .join('\n');
    navigator.clipboard.writeText(text);
  }

  uncheckAll() {
    this.checkedItems.set(
      this.checkedItems().map((i) => ({ ...i, checked: false }))
    );
  }
}
