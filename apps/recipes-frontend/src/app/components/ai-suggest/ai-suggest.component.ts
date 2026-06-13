import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import {
  Category,
  RecipesApiService,
  SuggestionContent,
  SuggestionItem,
  Tag,
} from '../../services/recipes-api.service';

/**
 * Reusable "suggest categories & tags with AI" panel.
 *
 * Works from raw recipe content so it can be used before a recipe is saved
 * (create form, AI import preview) as well as on the detail page. The AI may
 * propose brand-new categories/tags; selecting one of those creates it via the
 * API and emits `categoryCreated` / `tagCreated` so the host can add it to its
 * own option list. Selection itself is delegated to the host through the
 * apply/remove outputs, keeping this component compatible with both reactive
 * forms and signal-based state.
 */
@Component({
  selector: 'app-ai-suggest',
  standalone: true,
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ai-suggest">
      <div class="ai-suggest-bar">
        <p-button
          [label]="hasRun() ? 'Re-suggest' : 'Suggest with AI'"
          icon="pi pi-sparkles"
          severity="secondary"
          [outlined]="true"
          size="small"
          (click)="suggest()"
          [loading]="loading()"
          [disabled]="loading() || !canSuggest()"
        />
        @if (!canSuggest() && !hasRun()) {
        <span class="ai-suggest-hint">Add a title first</span>
        }
      </div>

      @if (error()) {
      <div class="ai-suggest-error">
        <i class="pi pi-exclamation-circle"></i> {{ error() }}
      </div>
      } @if (categorySuggestions().length > 0) {
      <div class="ai-suggest-group">
        <span class="ai-suggest-label">Categories</span>
        <div class="ai-suggest-chips">
          @for (item of categorySuggestions(); track item.name) {
          <button
            type="button"
            class="suggest-chip"
            [class.applied]="isApplied(item, selectedCategoryIds())"
            [class.is-new]="item.isNew"
            [disabled]="isBusy(item.name)"
            (click)="onCategoryClick(item)"
          >
            @if (isBusy(item.name)) {
            <i class="pi pi-spin pi-spinner"></i>
            } @else if (isApplied(item, selectedCategoryIds())) {
            <i class="pi pi-check"></i>
            } @else if (item.isNew) {
            <i class="pi pi-plus"></i>
            }
            <span>{{ item.name }}</span>
            @if (item.isNew) {
            <span class="new-badge">new</span>
            }
          </button>
          }
        </div>
      </div>
      } @if (tagSuggestions().length > 0) {
      <div class="ai-suggest-group">
        <span class="ai-suggest-label">Tags</span>
        <div class="ai-suggest-chips">
          @for (item of tagSuggestions(); track item.name) {
          <button
            type="button"
            class="suggest-chip"
            [class.applied]="isApplied(item, selectedTagIds())"
            [class.is-new]="item.isNew"
            [disabled]="isBusy(item.name)"
            (click)="onTagClick(item)"
          >
            @if (isBusy(item.name)) {
            <i class="pi pi-spin pi-spinner"></i>
            } @else if (isApplied(item, selectedTagIds())) {
            <i class="pi pi-check"></i>
            } @else if (item.isNew) {
            <i class="pi pi-plus"></i>
            }
            <span>{{ item.name }}</span>
            @if (item.isNew) {
            <span class="new-badge">new</span>
            }
          </button>
          }
        </div>
      </div>
      } @if (hasRun() && !loading() && !error() && categorySuggestions().length
      === 0 && tagSuggestions().length === 0) {
      <div class="ai-suggest-empty">No suggestions for this recipe.</div>
      }
    </div>
  `,
  styles: `
    @use 'styles/shared' as *;

    .ai-suggest {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ai-suggest-bar {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ai-suggest-hint,
    .ai-suggest-empty {
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
    }

    .ai-suggest-error {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
      color: #ef4444;
    }

    .ai-suggest-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .ai-suggest-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--p-text-muted-color);
    }

    .ai-suggest-chips {
      @include chip-row;
      gap: 8px;
    }

    .suggest-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 16px;
      border: 1px solid var(--p-surface-600);
      background: var(--p-surface-800);
      color: var(--p-text-color);
      font-size: 0.8rem;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.15s ease;

      i {
        font-size: 0.75rem;
      }

      &:hover:not(:disabled) {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
      }

      &.applied {
        background: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
        font-weight: 600;
      }

      &.is-new:not(.applied) {
        border-style: dashed;
      }

      &:disabled {
        opacity: 0.7;
        cursor: default;
      }
    }

    .new-badge {
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 5px;
      border-radius: 6px;
      background: var(--p-surface-600);
      color: var(--p-text-muted-color);
    }
  `,
})
export class AiSuggestComponent {
  private api = inject(RecipesApiService);

  /** Current recipe content used to generate suggestions. */
  content = input<SuggestionContent | null>(null);
  /** Currently selected ids, used to render the "applied" state. */
  selectedCategoryIds = input<string[]>([]);
  selectedTagIds = input<string[]>([]);

  applyCategory = output<string>();
  removeCategory = output<string>();
  applyTag = output<string>();
  removeTag = output<string>();
  categoryCreated = output<Category>();
  tagCreated = output<Tag>();

  loading = signal(false);
  hasRun = signal(false);
  error = signal('');
  categorySuggestions = signal<SuggestionItem[]>([]);
  tagSuggestions = signal<SuggestionItem[]>([]);
  private busyNames = signal<ReadonlySet<string>>(new Set());

  canSuggest = computed(() => !!this.content()?.title?.trim());

  isApplied(item: SuggestionItem, selected: string[]): boolean {
    return item.id !== null && selected.includes(item.id);
  }

  isBusy(name: string): boolean {
    return this.busyNames().has(name);
  }

  suggest() {
    const content = this.content();
    if (!content?.title?.trim() || this.loading()) return;

    this.loading.set(true);
    this.error.set('');

    this.api.suggestTagsAndCategoriesForContent(content).subscribe({
      next: (result) => {
        this.categorySuggestions.set(result.suggestedCategories);
        this.tagSuggestions.set(result.suggestedTags);
        this.loading.set(false);
        this.hasRun.set(true);
      },
      error: () => {
        this.error.set('Could not get suggestions. Please try again.');
        this.loading.set(false);
        this.hasRun.set(true);
      },
    });
  }

  onCategoryClick(item: SuggestionItem) {
    if (this.isBusy(item.name)) return;

    if (item.id !== null) {
      if (this.selectedCategoryIds().includes(item.id)) {
        this.removeCategory.emit(item.id);
      } else {
        this.applyCategory.emit(item.id);
      }
      return;
    }

    // Brand-new category: create it, then apply.
    this.setBusy(item.name, true);
    this.api.createCategory({ name: item.name }).subscribe({
      next: (created) => {
        this.categoryCreated.emit(created);
        this.applyCategory.emit(created.id);
        this.markCreated(this.categorySuggestions, item.name, created.id);
        this.setBusy(item.name, false);
      },
      error: () => {
        this.error.set(`Could not create category "${item.name}".`);
        this.setBusy(item.name, false);
      },
    });
  }

  onTagClick(item: SuggestionItem) {
    if (this.isBusy(item.name)) return;

    if (item.id !== null) {
      if (this.selectedTagIds().includes(item.id)) {
        this.removeTag.emit(item.id);
      } else {
        this.applyTag.emit(item.id);
      }
      return;
    }

    this.setBusy(item.name, true);
    this.api.createTag({ name: item.name }).subscribe({
      next: (created) => {
        this.tagCreated.emit(created);
        this.applyTag.emit(created.id);
        this.markCreated(this.tagSuggestions, item.name, created.id);
        this.setBusy(item.name, false);
      },
      error: () => {
        this.error.set(`Could not create tag "${item.name}".`);
        this.setBusy(item.name, false);
      },
    });
  }

  /** Reset suggestions (e.g. when the host content is replaced). */
  reset() {
    this.categorySuggestions.set([]);
    this.tagSuggestions.set([]);
    this.error.set('');
    this.hasRun.set(false);
  }

  private setBusy(name: string, busy: boolean) {
    this.busyNames.update((prev) => {
      const next = new Set(prev);
      if (busy) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  private markCreated(
    list: typeof this.categorySuggestions,
    name: string,
    id: string
  ) {
    list.update((items) =>
      items.map((i) => (i.name === name ? { ...i, id, isNew: false } : i))
    );
  }
}
