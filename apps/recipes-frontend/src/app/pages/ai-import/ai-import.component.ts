import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressBarModule } from 'primeng/progressbar';
import { TextareaModule } from 'primeng/textarea';
import {
  RecipesApiService,
  ParsedRecipe,
  ImportProgressEvent,
} from '../../services/recipes-api.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-ai-import',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    ButtonModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    ProgressBarModule,
    TextareaModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ai-import-page">
      <!-- Header -->
      <div class="page-header">
        <p-button
          icon="pi pi-arrow-left"
          label="Back"
          [text]="true"
          severity="secondary"
          (click)="router.navigate(['/recipes'])"
        />
        <h1 class="page-title">Import Recipe with AI</h1>
      </div>

      @if (parsing() || creating()) {
      <!-- Progress Phase -->
      <div class="progress-section">
        <div class="progress-icon">
          <i class="pi pi-sparkles"></i>
        </div>
        <p class="progress-message">{{ progressMessage() }}</p>
        <p-progressBar
          [value]="progressPercent()"
          [showValue]="false"
          [style]="{ height: '6px' }"
        />
        <p class="progress-detail">{{ progressDetail() }}</p>
      </div>
      } @else if (!parsed()) {
      <!-- Input Phase -->
      <div class="input-section">
        <p class="intro-text">
          Import a recipe from a URL or paste recipe text and AI will parse it
          into a structured recipe for you.
        </p>

        <!-- Mode Toggle -->
        <div class="mode-toggle">
          <button
            class="mode-btn"
            [class.active]="mode() === 'url'"
            (click)="mode.set('url')"
          >
            <i class="pi pi-link"></i> Import from URL
          </button>
          <button
            class="mode-btn"
            [class.active]="mode() === 'text'"
            (click)="mode.set('text')"
          >
            <i class="pi pi-file-edit"></i> Paste Text
          </button>
        </div>

        @if (mode() === 'url') {
        <p-inputgroup>
          <p-inputgroup-addon>
            <i class="pi pi-link"></i>
          </p-inputgroup-addon>
          <input
            pInputText
            [(ngModel)]="urlText"
            placeholder="https://www.allrecipes.com/recipe/..."
            class="full-width"
          />
        </p-inputgroup>
        <p class="helper-text">
          Works with most recipe sites (AllRecipes, Food Network, BBC Good Food,
          etc.)
        </p>
        } @else {
        <textarea
          pTextarea
          [autoResize]="true"
          [(ngModel)]="inputText"
          rows="16"
          placeholder="Paste recipe text here..."
          class="full-width"
        ></textarea>
        } @if (error()) {
        <div class="error-banner">
          <i class="pi pi-exclamation-triangle"></i>
          {{ error() }}
        </div>
        }

        <div class="actions">
          <p-button
            [label]="mode() === 'url' ? 'Import Recipe' : 'Parse Recipe'"
            icon="pi pi-sparkles"
            (click)="mode() === 'url' ? parseUrl() : parse()"
            [disabled]="mode() === 'url' ? !urlText.trim() : !inputText.trim()"
          />
        </div>
      </div>
      } @else {
      <!-- Preview Phase -->
      <div class="preview-section">
        <div class="success-indicator">
          <i class="pi pi-check-circle"></i>
          Recipe parsed successfully!
        </div>

        <div class="preview">
          <h2 class="preview-title">{{ parsed()!.title }}</h2>
          @if (parsed()!.description) {
          <p class="preview-desc">{{ parsed()!.description }}</p>
          }

          <div class="preview-meta">
            @if (parsed()!.prepTimeMinutes) {
            <div class="meta-badge">
              <i class="pi pi-stopwatch"></i>
              <span>{{ parsed()!.prepTimeMinutes }}m prep</span>
            </div>
            } @if (parsed()!.cookTimeMinutes) {
            <div class="meta-badge">
              <i class="pi pi-clock"></i>
              <span>{{ parsed()!.cookTimeMinutes }}m cook</span>
            </div>
            } @if (parsed()!.servings) {
            <div class="meta-badge">
              <i class="pi pi-users"></i>
              <span>{{ parsed()!.servings }} servings</span>
            </div>
            }
          </div>

          <div class="preview-detail">
            <h3>Ingredients</h3>
            <ul class="ingredient-list">
              @for (ing of parsed()!.ingredients; track $index) {
              <li>
                <span class="ing-qty">{{ ing.quantity }}</span>
                <span class="ing-unit">{{ ing.unit }}</span>
                <span class="ing-name">{{ ing.name }}</span>
                @if (ing.notes) {
                <span class="ing-notes">({{ ing.notes }})</span>
                }
              </li>
              }
            </ul>
          </div>

          @if (parsed()!.instructions) {
          <div class="preview-detail">
            <h3>Instructions</h3>
            <p class="instructions-text">{{ parsed()!.instructions }}</p>
          </div>
          }
        </div>

        <div class="actions">
          <p-button
            label="Try Again"
            severity="secondary"
            [outlined]="true"
            icon="pi pi-refresh"
            (click)="parsed.set(null)"
          />
          <p-button
            label="Create Recipe"
            icon="pi pi-check"
            (click)="create()"
          />
        </div>
      </div>
      }
    </div>
  `,
  styles: `
    .ai-import-page {
      max-width: 800px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 12px 0 0;
    }

    .intro-text {
      color: var(--p-text-muted-color);
      font-size: 0.95rem;
      margin: 0 0 16px;
    }

    .progress-section {
      text-align: center;
      padding: 60px 20px;
    }

    .progress-icon {
      font-size: 2.5rem;
      color: var(--p-primary-color);
      margin-bottom: 16px;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    .progress-message {
      font-size: 1.15rem;
      font-weight: 600;
      margin: 0 0 20px;
    }

    .progress-detail {
      color: var(--p-text-muted-color);
      font-size: 0.85rem;
      margin: 12px 0 0;
    }

    .mode-toggle {
      display: flex;
      gap: 0;
      margin-bottom: 16px;
      border: 1px solid var(--p-surface-600);
      border-radius: 8px;
      overflow: hidden;
    }

    .mode-btn {
      flex: 1;
      padding: 10px 16px;
      border: none;
      background: transparent;
      color: var(--p-text-muted-color);
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;

      &.active {
        background: var(--p-primary-color);
        color: var(--p-primary-contrast-color);
        font-weight: 600;
      }

      &:hover:not(.active) {
        background: var(--p-surface-700);
      }
    }

    .helper-text {
      color: var(--p-text-muted-color);
      font-size: 0.8rem;
      margin: 8px 0 0;
    }

    .full-width {
      width: 100%;
      font-size: 0.95rem;
    }

    .error-banner {
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 8px;
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 20px;
    }

    .success-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 8px;
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 20px;
    }

    .preview {
      background: var(--p-surface-800);
      border-radius: 12px;
      padding: 24px;
    }

    .preview-title {
      margin: 0 0 8px;
      font-size: 1.4rem;
      font-weight: 700;
    }

    .preview-desc {
      color: var(--p-text-muted-color);
      margin: 0 0 16px;
      font-size: 0.95rem;
    }

    .preview-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .meta-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      background: var(--p-surface-700);
      font-size: 0.85rem;
      color: var(--p-text-muted-color);

      i {
        color: var(--p-primary-color);
      }
    }

    .preview-detail {
      margin-bottom: 20px;

      h3 {
        font-size: 1rem;
        font-weight: 600;
        margin: 0 0 10px;
      }
    }

    .ingredient-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: max-content max-content 1fr max-content;
      gap: 6px 0;

      li {
        display: grid;
        grid-template-columns: subgrid;
        grid-column: 1 / -1;
        gap: 0 10px;
        padding: 8px 12px;
        background: var(--p-surface-700);
        border-radius: 6px;
        font-size: 0.9rem;
      }
    }

    .ing-qty {
      font-weight: 600;
      color: var(--p-primary-color);
      text-align: right;
    }

    .ing-unit {
      color: var(--p-text-muted-color);
    }

    .ing-name {
      font-weight: 600;
    }

    .ing-notes {
      color: var(--p-text-muted-color);
      font-style: italic;
    }

    .instructions-text {
      font-size: 0.95rem;
      line-height: 1.7;
      color: var(--p-text-muted-color);
      white-space: pre-wrap;
      margin: 0;
    }
  `,
})
export class AiImportComponent {
  private api = inject(RecipesApiService);
  router = inject(Router);

  mode = signal<'url' | 'text'>('url');
  inputText = '';
  urlText = '';
  parsing = signal(false);
  creating = signal(false);
  parsed = signal<ParsedRecipe | null>(null);
  error = signal('');
  progressPercent = signal(0);
  progressMessage = signal('Starting...');
  progressDetail = signal('');

  private streamSub?: Subscription;

  private resetProgress() {
    this.progressPercent.set(0);
    this.progressMessage.set('Starting...');
    this.progressDetail.set('');
  }

  parseUrl() {
    if (!this.urlText.trim()) return;
    this.parsing.set(true);
    this.error.set('');
    this.resetProgress();

    this.streamSub?.unsubscribe();
    this.streamSub = this.api.parseRecipeFromUrlStream(this.urlText).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.progressPercent.set(event.percent ?? 0);
          this.progressMessage.set(event.message ?? 'Processing...');
        } else if (event.type === 'result' && event.result) {
          this.parsed.set(event.result);
          this.parsing.set(false);
        }
      },
      error: (err) => {
        const message =
          err?.message ||
          'Failed to import recipe from URL. Try pasting the text instead.';
        this.error.set(message);
        this.parsing.set(false);
      },
    });
  }

  parse() {
    if (!this.inputText.trim()) return;
    this.parsing.set(true);
    this.error.set('');
    this.resetProgress();

    this.streamSub?.unsubscribe();
    this.streamSub = this.api
      .parseRecipeFromTextStream(this.inputText)
      .subscribe({
        next: (event) => {
          if (event.type === 'progress') {
            this.progressPercent.set(event.percent ?? 0);
            this.progressMessage.set(event.message ?? 'Processing...');
          } else if (event.type === 'result' && event.result) {
            this.parsed.set(event.result);
            this.parsing.set(false);
          }
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
    this.progressPercent.set(30);
    this.progressMessage.set('Creating recipe...');
    this.progressDetail.set('');

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
        const navigateToRecipe = () => {
          this.creating.set(false);
          this.router.navigate(['/recipes', created.id]);
        };

        // Import photos from URLs if available
        if (recipe.imageUrls?.length) {
          this.progressPercent.set(65);
          this.progressMessage.set('Importing photos...');
          this.progressDetail.set(
            `Downloading ${recipe.imageUrls.length} image${
              recipe.imageUrls.length > 1 ? 's' : ''
            }...`
          );

          this.api
            .importPhotosFromUrls(created.id, recipe.imageUrls)
            .subscribe({
              next: (result) => {
                this.progressPercent.set(100);
                this.progressMessage.set('Done!');
                this.progressDetail.set(
                  `Imported ${result.imported} photo${
                    result.imported !== 1 ? 's' : ''
                  }`
                );
                setTimeout(() => navigateToRecipe(), 400);
              },
              error: () => navigateToRecipe(),
            });
        } else {
          this.progressPercent.set(100);
          this.progressMessage.set('Done!');
          setTimeout(() => navigateToRecipe(), 300);
        }
      });
  }
}
