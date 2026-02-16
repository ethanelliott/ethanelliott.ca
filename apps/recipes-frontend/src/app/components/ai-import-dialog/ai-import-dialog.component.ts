import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {
  RecipesApiService,
  ParsedRecipe,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-ai-import-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, ProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [(visible)]="visible"
      header="Import Recipe with AI"
      [modal]="true"
      [style]="{ width: '550px' }"
      [closable]="true"
      (onHide)="reset()"
    >
      @if (!parsed()) {
      <!-- Input Phase -->
      <p class="intro-text">
        Paste recipe text from any source and our AI will parse it into a
        structured recipe for you.
      </p>
      <textarea
        pTextarea
        [(ngModel)]="inputText"
        rows="10"
        placeholder="Paste recipe text here..."
        class="full-width"
      ></textarea>

      @if (error()) {
      <div class="error-banner">
        <i class="pi pi-exclamation-triangle"></i>
        {{ error() }}
      </div>
      }

      <ng-template #footer>
        <div class="dialog-footer">
          <p-button
            label="Cancel"
            severity="secondary"
            [outlined]="true"
            (click)="visible = false"
          />
          <p-button
            label="Parse Recipe"
            icon="pi pi-sparkles"
            (click)="parse()"
            [loading]="parsing()"
            [disabled]="!inputText.trim()"
          />
        </div>
      </ng-template>
      } @else {
      <!-- Preview Phase -->
      <div class="success-indicator">
        <i class="pi pi-check-circle"></i>
        Recipe parsed successfully!
      </div>

      <div class="preview">
        <h3 class="preview-title">{{ parsed()!.title }}</h3>
        @if (parsed()!.description) {
        <p class="preview-desc">{{ parsed()!.description }}</p>
        }

        <div class="preview-section">
          <strong>Ingredients</strong>
          <ul>
            @for (ing of parsed()!.ingredients.slice(0, 5); track $index) {
            <li>{{ ing.quantity }} {{ ing.unit }} {{ ing.name }}</li>
            } @if (parsed()!.ingredients.length > 5) {
            <li class="more">
              ...and {{ parsed()!.ingredients.length - 5 }} more
            </li>
            }
          </ul>
        </div>

        @if (parsed()!.instructions) {
        <div class="preview-section">
          <strong>Instructions</strong>
          <p class="instructions-preview">
            {{ parsed()!.instructions.slice(0, 200)
            }}{{ parsed()!.instructions.length > 200 ? '...' : '' }}
          </p>
        </div>
        }

        <div class="preview-meta">
          @if (parsed()!.prepTimeMinutes) {
          <span>Prep: {{ parsed()!.prepTimeMinutes }}m</span>
          } @if (parsed()!.cookTimeMinutes) {
          <span>Cook: {{ parsed()!.cookTimeMinutes }}m</span>
          } @if (parsed()!.servings) {
          <span>Servings: {{ parsed()!.servings }}</span>
          }
        </div>
      </div>

      <ng-template #footer>
        <div class="dialog-footer">
          <p-button
            label="Try Again"
            severity="secondary"
            [outlined]="true"
            (click)="parsed.set(null)"
          />
          <p-button
            label="Create Recipe"
            icon="pi pi-check"
            (click)="create()"
            [loading]="creating()"
          />
        </div>
      </ng-template>
      }
    </p-dialog>
  `,
  styles: `
    .intro-text {
      color: var(--p-text-muted-color);
      font-size: 0.9rem;
      margin: 0 0 12px;
    }

    .full-width {
      width: 100%;
    }

    .error-banner {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dialog-footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .success-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .preview {
      background: var(--p-surface-800);
      border-radius: 12px;
      padding: 20px;
    }

    .preview-title {
      margin: 0 0 8px;
      font-size: 1.2rem;
      font-weight: 700;
    }

    .preview-desc {
      color: var(--p-text-muted-color);
      margin: 0 0 12px;
      font-size: 0.9rem;
    }

    .preview-section {
      margin-bottom: 12px;

      strong {
        font-size: 0.85rem;
        color: var(--p-text-muted-color);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      ul {
        margin: 6px 0 0;
        padding-left: 20px;
      }

      li {
        font-size: 0.9rem;
        margin-bottom: 2px;
      }

      .more {
        color: var(--p-text-muted-color);
        font-style: italic;
      }
    }

    .instructions-preview {
      font-size: 0.9rem;
      color: var(--p-text-muted-color);
      margin: 6px 0 0;
    }

    .preview-meta {
      display: flex;
      gap: 16px;
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--p-surface-700);
    }
  `,
})
export class AiImportDialogComponent {
  private api = inject(RecipesApiService);
  private router = inject(Router);

  closed = output<void>();

  visible = false;
  inputText = '';
  parsing = signal(false);
  creating = signal(false);
  parsed = signal<ParsedRecipe | null>(null);
  error = signal('');

  open() {
    this.reset();
    this.visible = true;
  }

  reset() {
    this.inputText = '';
    this.parsed.set(null);
    this.error.set('');
    this.parsing.set(false);
    this.creating.set(false);
  }

  parse() {
    if (!this.inputText.trim()) return;
    this.parsing.set(true);
    this.error.set('');

    this.api.parseRecipeFromText(this.inputText).subscribe({
      next: (result) => {
        this.parsed.set(result);
        this.parsing.set(false);
      },
      error: () => {
        this.error.set('Failed to parse recipe. Please try again.');
        this.parsing.set(false);
      },
    });
  }

  create() {
    const recipe = this.parsed();
    if (!recipe) return;

    this.creating.set(true);
    this.api
      .createRecipe({
        title: recipe.title,
        description: recipe.description,
        instructions: recipe.instructions,
        servings: recipe.servings,
        prepTimeMinutes: recipe.prepTimeMinutes,
        cookTimeMinutes: recipe.cookTimeMinutes,
        source: recipe.source,
        ingredients: recipe.ingredients.map((ing, idx) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes,
          orderIndex: idx,
        })),
      })
      .subscribe((created) => {
        this.creating.set(false);
        this.visible = false;
        this.router.navigate(['/recipes', created.id]);
      });
  }
}
