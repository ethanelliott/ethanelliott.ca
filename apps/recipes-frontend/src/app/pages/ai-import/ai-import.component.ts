import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { CardModule } from 'primeng/card';
import { ProgressBarModule } from 'primeng/progressbar';
import { TextareaModule } from 'primeng/textarea';
import {
  RecipesApiService,
  ParsedRecipe,
  Category,
  Tag,
  RecipeInput,
  SuggestionContent,
} from '../../services/recipes-api.service';
import { AiSuggestComponent } from '../../components/ai-suggest/ai-suggest.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-ai-import',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    InputNumberModule,
    MultiSelectModule,
    CardModule,
    ProgressBarModule,
    TextareaModule,
    AiSuggestComponent,
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
        <p class="progress-detail">
          {{ progressDetail() || 'This can take up to a minute for big pages.' }}
        </p>
      </div>
      } @else if (!parsed()) {
      <!-- Input Phase -->
      <div class="input-section">
        <p class="intro-text">
          Import a recipe from a URL or paste recipe text and AI will parse it
          into a structured recipe you can review and tweak before saving.
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
            (keydown.enter)="parseUrl()"
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
          <span>{{ error() }}</span>
          @if (mode() === 'url') {
          <button class="link-btn" (click)="switchToText()">
            Paste text instead
          </button>
          }
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
      <!-- Editable Preview Phase -->
      <div class="preview-section">
        <div class="success-indicator">
          <i class="pi pi-check-circle"></i>
          Recipe parsed — review and edit anything before saving.
        </div>

        <form [formGroup]="form">
          <p-card header="Details" styleClass="form-card">
            <div class="form-grid">
              <div class="form-field full-width">
                <label for="title">Title *</label>
                <input
                  pInputText
                  id="title"
                  formControlName="title"
                  placeholder="Recipe title"
                />
              </div>
              <div class="form-field full-width">
                <label for="description">Description</label>
                <textarea
                  pTextarea
                  [autoResize]="true"
                  id="description"
                  formControlName="description"
                  rows="2"
                ></textarea>
              </div>
              <div class="form-field">
                <label for="servings">Servings</label>
                <p-inputnumber
                  id="servings"
                  formControlName="servings"
                  [min]="1"
                  [showButtons]="true"
                  [fluid]="true"
                />
              </div>
              <div class="form-field">
                <label for="prep">Prep (min)</label>
                <p-inputnumber
                  id="prep"
                  formControlName="prepTimeMinutes"
                  [min]="0"
                  [showButtons]="true"
                  [fluid]="true"
                />
              </div>
              <div class="form-field">
                <label for="cook">Cook (min)</label>
                <p-inputnumber
                  id="cook"
                  formControlName="cookTimeMinutes"
                  [min]="0"
                  [showButtons]="true"
                  [fluid]="true"
                />
              </div>
              <div class="form-field">
                <label for="source">Source</label>
                <input
                  pInputText
                  id="source"
                  formControlName="source"
                  placeholder="URL or reference"
                />
              </div>
            </div>
          </p-card>

          <p-card header="Ingredients" styleClass="form-card">
            @if (ingredients.length === 0) {
            <p class="empty-message">No ingredients parsed — add some below.</p>
            }
            <div class="ingredients-list" formArrayName="ingredients">
              @for (ing of ingredients.controls; track $index; let i = $index) {
              <div class="ingredient-row" [formGroupName]="i">
                <p-inputnumber
                  formControlName="quantity"
                  placeholder="Qty"
                  [min]="0"
                  [fluid]="true"
                  class="ing-qty-input"
                />
                <input
                  pInputText
                  formControlName="unit"
                  placeholder="Unit"
                  class="ing-unit-input"
                />
                <input
                  pInputText
                  formControlName="name"
                  placeholder="Ingredient name"
                  class="ing-name-input"
                />
                <input
                  pInputText
                  formControlName="notes"
                  placeholder="Notes"
                  class="ing-notes-input"
                />
                <p-button
                  icon="pi pi-trash"
                  severity="danger"
                  [text]="true"
                  [rounded]="true"
                  (click)="removeIngredient(i)"
                />
              </div>
              }
            </div>
            <p-button
              label="Add Ingredient"
              icon="pi pi-plus"
              severity="secondary"
              [outlined]="true"
              (click)="addIngredient()"
              styleClass="mt-3"
            />
          </p-card>

          <p-card header="Instructions" styleClass="form-card">
            <textarea
              pTextarea
              [autoResize]="true"
              formControlName="instructions"
              rows="10"
              placeholder="Recipe instructions (Markdown supported)"
              class="full-width"
            ></textarea>
          </p-card>

          <p-card header="Categories & Tags" styleClass="form-card">
            <div class="form-grid">
              <div class="form-field">
                <label>Categories</label>
                <p-multiselect
                  [options]="categories()"
                  formControlName="categoryIds"
                  optionLabel="name"
                  optionValue="id"
                  placeholder="Select categories"
                  display="chip"
                  [fluid]="true"
                />
              </div>
              <div class="form-field">
                <label>Tags</label>
                <p-multiselect
                  [options]="tags()"
                  formControlName="tagIds"
                  optionLabel="name"
                  optionValue="id"
                  placeholder="Select tags"
                  display="chip"
                  [fluid]="true"
                />
              </div>
              <div class="form-field full-width ai-suggest-field">
                <app-ai-suggest
                  [content]="suggestionContent()"
                  [selectedCategoryIds]="form.value.categoryIds || []"
                  [selectedTagIds]="form.value.tagIds || []"
                  (applyCategory)="toggleSelection('categoryIds', $event, true)"
                  (removeCategory)="
                    toggleSelection('categoryIds', $event, false)
                  "
                  (applyTag)="toggleSelection('tagIds', $event, true)"
                  (removeTag)="toggleSelection('tagIds', $event, false)"
                  (categoryCreated)="categories.set([...categories(), $event])"
                  (tagCreated)="tags.set([...tags(), $event])"
                />
              </div>
            </div>
          </p-card>

          @if (imageUrls().length > 0) {
          <p-card header="Photos" styleClass="form-card">
            <p class="photos-note">
              <i class="pi pi-image"></i>
              {{ imageUrls().length }} photo{{
                imageUrls().length === 1 ? '' : 's'
              }}
              will be imported from the source.
            </p>
          </p-card>
          }
        </form>

        <div class="actions">
          <p-button
            label="Start Over"
            severity="secondary"
            [outlined]="true"
            icon="pi pi-refresh"
            (click)="reset()"
          />
          <p-button
            label="Create Recipe"
            icon="pi pi-check"
            (click)="create()"
            [disabled]="form.invalid"
          />
        </div>
      </div>
      }
    </div>
  `,
  styles: `
    @use 'styles/shared' as *;

    .ai-import-page {
      @include page(800px);
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      @include page-title;
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
      flex-wrap: wrap;
    }

    .link-btn {
      background: none;
      border: none;
      color: #ef4444;
      text-decoration: underline;
      cursor: pointer;
      font: inherit;
      padding: 0;
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

    :host ::ng-deep .form-card {
      margin-bottom: 16px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .full-width {
      grid-column: 1 / -1;
    }

    .ai-suggest-field {
      padding-top: 12px;
      border-top: 1px dashed var(--p-surface-700);
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--p-text-muted-color);
      }

      input,
      textarea {
        width: 100%;
      }
    }

    .ingredients-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ingredient-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .ing-qty-input,
    .ing-unit-input {
      width: 80px;
      min-width: 80px;
      max-width: 80px;
      flex-shrink: 0;
    }

    .ing-name-input {
      flex: 1;
      min-width: 0;
    }

    .ing-notes-input {
      width: 120px;
      min-width: 120px;
      max-width: 120px;
      flex-shrink: 0;
    }

    .empty-message {
      color: var(--p-text-muted-color);
      text-align: center;
      padding: 16px;
      margin: 0;
    }

    .photos-note {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--p-text-muted-color);
      font-size: 0.9rem;

      i {
        color: var(--p-primary-color);
      }
    }

    @include small {
      .form-grid {
        grid-template-columns: 1fr;
      }

      .ingredient-row {
        flex-wrap: wrap;
      }

      .ing-qty-input,
      .ing-unit-input {
        width: calc(50% - 4px);
        min-width: 0;
        max-width: none;
      }

      .ing-name-input {
        flex-basis: 100%;
      }

      .ing-notes-input {
        flex: 1;
        width: auto;
        min-width: 0;
        max-width: none;
      }

      .actions {
        flex-direction: column-reverse;
      }
    }
  `,
})
export class AiImportComponent implements OnDestroy {
  private api = inject(RecipesApiService);
  private fb = inject(FormBuilder);
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

  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);
  imageUrls = signal<string[]>([]);

  form: FormGroup = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    servings: [4],
    prepTimeMinutes: [null as number | null],
    cookTimeMinutes: [null as number | null],
    source: [''],
    categoryIds: [[] as string[]],
    tagIds: [[] as string[]],
    ingredients: this.fb.array([]),
    instructions: [''],
  });

  private streamSub?: Subscription;

  constructor() {
    this.api.getCategories().subscribe((c) => this.categories.set(c));
    this.api.getTags().subscribe((t) => this.tags.set(t));
  }

  ngOnDestroy() {
    this.streamSub?.unsubscribe();
  }

  get ingredients(): FormArray {
    return this.form.get('ingredients') as FormArray;
  }

  suggestionContent(): SuggestionContent {
    const v = this.form.value;
    return {
      title: v.title || '',
      description: v.description || undefined,
      instructions: v.instructions || undefined,
      ingredients: (v.ingredients || [])
        .map((i: { name?: string }) => ({ name: (i.name || '').trim() }))
        .filter((i: { name: string }) => i.name.length > 0),
    };
  }

  toggleSelection(
    control: 'categoryIds' | 'tagIds',
    id: string,
    selected: boolean
  ) {
    const current: string[] = this.form.get(control)?.value || [];
    const next = selected
      ? current.includes(id)
        ? current
        : [...current, id]
      : current.filter((x) => x !== id);
    this.form.get(control)?.setValue(next);
  }

  addIngredient() {
    this.ingredients.push(
      this.fb.group({ quantity: [1], unit: [''], name: [''], notes: [''] })
    );
  }

  removeIngredient(index: number) {
    this.ingredients.removeAt(index);
  }

  switchToText() {
    this.mode.set('text');
    this.error.set('');
  }

  reset() {
    this.streamSub?.unsubscribe();
    this.parsed.set(null);
    this.imageUrls.set([]);
    this.error.set('');
    this.resetProgress();
  }

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
          this.populateForm(event.result);
          this.parsing.set(false);
        }
      },
      error: (err) => {
        this.error.set(
          err?.message ||
            'Failed to import recipe from URL. Try pasting the text instead.'
        );
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
            this.populateForm(event.result);
            this.parsing.set(false);
          }
        },
        error: () => {
          this.error.set('Failed to parse recipe. Please try again.');
          this.parsing.set(false);
        },
      });
  }

  private populateForm(recipe: ParsedRecipe) {
    this.ingredients.clear();
    (recipe.ingredients || []).forEach((ing) => {
      this.ingredients.push(
        this.fb.group({
          quantity: [ing.quantity ?? 1],
          unit: [ing.unit ?? ''],
          name: [ing.name ?? ''],
          notes: [ing.notes ?? ''],
        })
      );
    });

    this.form.patchValue({
      title: recipe.title || '',
      description: recipe.description || '',
      servings: recipe.servings ?? 4,
      prepTimeMinutes: recipe.prepTimeMinutes ?? null,
      cookTimeMinutes: recipe.cookTimeMinutes ?? null,
      source: recipe.source || '',
      categoryIds: [],
      tagIds: [],
      instructions: recipe.instructions || '',
    });

    this.imageUrls.set(recipe.imageUrls ?? []);
    this.parsed.set(recipe);
  }

  create() {
    if (this.form.invalid) return;
    const v = this.form.value;

    this.creating.set(true);
    this.progressPercent.set(30);
    this.progressMessage.set('Creating recipe...');
    this.progressDetail.set('');

    const input: RecipeInput = {
      title: v.title,
      description: v.description || undefined,
      instructions: v.instructions || undefined,
      servings: v.servings || undefined,
      prepTimeMinutes: v.prepTimeMinutes || undefined,
      cookTimeMinutes: v.cookTimeMinutes || undefined,
      source: v.source || undefined,
      categoryIds: v.categoryIds || [],
      tagIds: v.tagIds || [],
      ingredients: (v.ingredients || []).map(
        (
          i: { quantity: number; unit: string; name: string; notes: string },
          idx: number
        ) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          notes: i.notes || undefined,
          orderIndex: idx,
        })
      ),
    };

    this.api.createRecipe(input).subscribe({
      next: (created) => {
        const navigateToRecipe = () => {
          this.creating.set(false);
          this.router.navigate(['/recipes', created.id]);
        };

        const urls = this.imageUrls();
        if (urls.length) {
          this.progressPercent.set(65);
          this.progressMessage.set('Importing photos...');
          this.progressDetail.set(
            `Downloading ${urls.length} image${urls.length > 1 ? 's' : ''}...`
          );

          this.api.importPhotosFromUrls(created.id, urls).subscribe({
            next: (result) => {
              this.progressPercent.set(100);
              this.progressMessage.set('Done!');
              this.progressDetail.set(
                `Imported ${result.imported} photo${
                  result.imported !== 1 ? 's' : ''
                }`
              );
              setTimeout(navigateToRecipe, 400);
            },
            error: navigateToRecipe,
          });
        } else {
          this.progressPercent.set(100);
          this.progressMessage.set('Done!');
          setTimeout(navigateToRecipe, 300);
        }
      },
      error: () => {
        this.creating.set(false);
        this.error.set('Could not create the recipe. Please try again.');
      },
    });
  }
}
