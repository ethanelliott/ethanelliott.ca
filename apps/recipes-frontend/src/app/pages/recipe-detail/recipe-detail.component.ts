import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { AccordionModule } from 'primeng/accordion';
import { TabsModule } from 'primeng/tabs';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  RecipesApiService,
  Recipe,
  Ingredient,
  Message,
  CookingTipsResponse,
  FlavorProfileResponse,
} from '../../services/recipes-api.service';
import { marked } from 'marked';

@Component({
  selector: 'app-recipe-detail',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    ButtonModule,
    ChipModule,
    AccordionModule,
    TabsModule,
    InputTextModule,
    ProgressSpinnerModule,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    @if (loading()) {
    <div class="loading-container">
      <p-progress-spinner ariaLabel="Loading recipe" />
    </div>
    } @else if (recipe()) {
    <div class="recipe-detail">
      <!-- Header -->
      <div class="detail-header">
        <p-button
          icon="pi pi-arrow-left"
          label="Back"
          [text]="true"
          severity="secondary"
          (click)="router.navigate(['/recipes'])"
        />
        <div class="header-actions">
          <p-button
            icon="pi pi-pencil"
            label="Edit"
            severity="secondary"
            [outlined]="true"
            (click)="router.navigate(['/recipes', recipe()!.id, 'edit'])"
          />
          <p-button
            icon="pi pi-trash"
            label="Delete"
            severity="danger"
            [outlined]="true"
            (click)="confirmDelete()"
          />
        </div>
      </div>

      <h1 class="recipe-title">{{ recipe()!.title }}</h1>
      @if (recipe()!.description) {
      <p class="recipe-description">{{ recipe()!.description }}</p>
      }

      <!-- Metadata -->
      <div class="meta-strip">
        @if (recipe()!.prepTimeMinutes) {
        <div class="meta-badge">
          <i class="pi pi-stopwatch"></i>
          <span class="meta-value">{{ recipe()!.prepTimeMinutes }}</span>
          <span class="meta-label">min prep</span>
        </div>
        } @if (recipe()!.cookTimeMinutes) {
        <div class="meta-badge">
          <i class="pi pi-clock"></i>
          <span class="meta-value">{{ recipe()!.cookTimeMinutes }}</span>
          <span class="meta-label">min cook</span>
        </div>
        }
        <div class="meta-badge">
          <i class="pi pi-users"></i>
          <span class="meta-value">{{ recipe()!.servings }}</span>
          <span class="meta-label">servings</span>
        </div>
      </div>

      <!-- Categories & Tags -->
      @if (recipe()!.categories.length > 0 || recipe()!.tags.length > 0) {
      <div class="chips-section">
        @for (cat of recipe()!.categories; track cat.id) {
        <span
          class="category-chip"
          [style.background]="cat.color || 'var(--p-primary-color)'"
          [style.color]="'#000'"
        >
          {{ cat.name }}
        </span>
        } @for (tag of recipe()!.tags; track tag.id) {
        <span
          class="tag-chip"
          [style.border-color]="tag.color || 'var(--p-primary-color)'"
          [style.color]="tag.color || 'var(--p-primary-color)'"
        >
          {{ tag.name }}
        </span>
        }
      </div>
      }

      <!-- Photos -->
      @if (recipe()!.photos && recipe()!.photos!.length > 0) {
      <div class="photos-section">
        <h2 class="section-title">Photos</h2>
        <div class="photos-scroll">
          @for (photo of recipe()!.photos!; track photo.id) {
          <img
            [src]="api.getPhotoUrl(photo.id)"
            [alt]="recipe()!.title"
            class="recipe-photo"
          />
          }
        </div>
      </div>
      }

      <!-- Ingredients -->
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">Ingredients</h2>
          <div class="servings-adjuster">
            <p-button
              icon="pi pi-minus"
              [rounded]="true"
              [text]="true"
              severity="secondary"
              size="small"
              (click)="adjustServings(-1)"
              [disabled]="currentServings() <= 1"
            />
            <span class="servings-display">{{ currentServings() }}</span>
            <p-button
              icon="pi pi-plus"
              [rounded]="true"
              [text]="true"
              severity="secondary"
              size="small"
              (click)="adjustServings(1)"
            />
          </div>
        </div>
        @if (ingredientsLoading()) {
        <p-progress-spinner
          [style]="{ width: '30px', height: '30px' }"
          ariaLabel="Loading"
        />
        } @else {
        <ul class="ingredient-list">
          @for (ing of displayIngredients(); track ing.id) {
          <li class="ingredient-item">
            <span class="ing-qty">{{ formatQuantity(ing.quantity) }}</span>
            <span class="ing-unit">{{ ing.unit }}</span>
            <span class="ing-name">{{ ing.name }}</span>
            @if (ing.notes) {
            <span class="ing-notes">({{ ing.notes }})</span>
            }
          </li>
          }
        </ul>
        }
      </div>

      <!-- Instructions -->
      @if (recipe()!.instructions) {
      <div class="section">
        <h2 class="section-title">Instructions</h2>
        <div
          class="markdown-content"
          [innerHTML]="renderedInstructions()"
        ></div>
      </div>
      }

      <!-- Notes -->
      @if (recipe()!.notes) {
      <div class="section">
        <h2 class="section-title">Personal Notes</h2>
        <p class="notes-text">{{ recipe()!.notes }}</p>
      </div>
      }

      <!-- AI Assistant -->
      <div class="section">
        <p-accordion>
          <p-accordion-panel value="ai">
            <p-accordion-header>
              <i
                class="pi pi-sparkles"
                style="margin-right: 8px; color: var(--p-primary-color)"
              ></i>
              AI Assistant
            </p-accordion-header>
            <p-accordion-content>
              <p-tabs value="chat">
                <p-tablist>
                  <p-tab value="chat">Ask</p-tab>
                  <p-tab value="tips">Tips</p-tab>
                  <p-tab value="flavor">Flavor</p-tab>
                </p-tablist>
                <p-tabpanels>
                  <!-- Chat Tab -->
                  <p-tabpanel value="chat">
                    <div class="chat-container">
                      @if (chatMessages().length === 0) {
                      <div class="chat-empty">
                        <p>Ask me anything about this recipe!</p>
                        <div class="example-prompts">
                          @for (prompt of examplePrompts; track prompt) {
                          <p-button
                            [label]="prompt"
                            severity="secondary"
                            [outlined]="true"
                            size="small"
                            (click)="sendChat(prompt)"
                          />
                          }
                        </div>
                      </div>
                      } @else {
                      <div class="chat-messages">
                        @for (msg of chatMessages(); track $index) {
                        <div
                          class="chat-bubble"
                          [class.user]="msg.role === 'user'"
                          [class.assistant]="msg.role === 'assistant'"
                        >
                          {{ msg.content }}
                        </div>
                        }
                      </div>
                      }
                      <div class="chat-input">
                        <input
                          pInputText
                          [(ngModel)]="chatInput"
                          placeholder="Ask about this recipe..."
                          (keydown.enter)="sendChat(chatInput)"
                          [disabled]="chatLoading()"
                        />
                        <p-button
                          icon="pi pi-send"
                          [rounded]="true"
                          (click)="sendChat(chatInput)"
                          [loading]="chatLoading()"
                          [disabled]="!chatInput.trim()"
                        />
                      </div>
                    </div>
                  </p-tabpanel>

                  <!-- Tips Tab -->
                  <p-tabpanel value="tips">
                    @if (!tipsData()) {
                    <div class="ai-generate">
                      <p-button
                        label="Generate Cooking Tips"
                        icon="pi pi-sparkles"
                        (click)="generateTips()"
                        [loading]="tipsLoading()"
                      />
                    </div>
                    } @else {
                    <div class="tips-content">
                      <h3>Pro Tips</h3>
                      <ul>
                        @for (tip of tipsData()!.tips; track $index) {
                        <li>{{ tip }}</li>
                        }
                      </ul>
                      <h3>Common Mistakes to Avoid</h3>
                      <ul>
                        @for (mistake of tipsData()!.commonMistakes; track
                        $index) {
                        <li>{{ mistake }}</li>
                        }
                      </ul>
                    </div>
                    }
                  </p-tabpanel>

                  <!-- Flavor Tab -->
                  <p-tabpanel value="flavor">
                    @if (!flavorData()) {
                    <div class="ai-generate">
                      <p-button
                        label="Analyze Flavor Profile"
                        icon="pi pi-sparkles"
                        (click)="generateFlavor()"
                        [loading]="flavorLoading()"
                      />
                    </div>
                    } @else {
                    <div class="flavor-content">
                      <div class="flavor-chips">
                        @for (flavor of flavorData()!.primaryFlavors; track
                        flavor) {
                        <p-chip [label]="flavor" />
                        }
                      </div>
                      <p class="flavor-description">
                        {{ flavorData()!.tasteProfile }}
                      </p>
                      <h3>Pairing Recommendations</h3>
                      <ul>
                        @for (rec of flavorData()!.pairingRecommendations; track
                        $index) {
                        <li>{{ rec }}</li>
                        }
                      </ul>
                    </div>
                    }
                  </p-tabpanel>
                </p-tabpanels>
              </p-tabs>
            </p-accordion-content>
          </p-accordion-panel>
        </p-accordion>
      </div>

      <!-- Source -->
      @if (recipe()!.source) {
      <div class="source-section">
        <span class="source-label">Source:</span>
        <span class="source-value">{{ recipe()!.source }}</span>
      </div>
      }
    </div>
    }
  `,
  styles: `
    .loading-container {
      display: flex;
      justify-content: center;
      padding: 64px 0;
    }

    .recipe-detail {
      max-width: 900px;
      margin: 0 auto;
    }

    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .recipe-title {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: var(--p-text-color);
    }

    .recipe-description {
      font-size: 1rem;
      color: var(--p-text-muted-color);
      margin: 0 0 20px;
      line-height: 1.6;
    }

    .meta-strip {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .meta-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-700);
      border-radius: 10px;

      i {
        color: var(--p-primary-color);
      }
    }

    .meta-value {
      font-weight: 600;
      font-size: 1.1rem;
    }

    .meta-label {
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
    }

    .chips-section {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 24px;
    }

    .category-chip {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .tag-chip {
      padding: 4px 12px;
      border: 1.5px solid;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
      background: transparent;
    }

    .section {
      margin-bottom: 32px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 16px;
      color: var(--p-text-color);
    }

    .servings-adjuster {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .servings-display {
      font-size: 1.1rem;
      font-weight: 600;
      min-width: 24px;
      text-align: center;
    }

    .ingredient-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ingredient-item {
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      background: var(--p-surface-800);
      border-radius: 8px;
      font-size: 0.9rem;
    }

    .ing-qty {
      font-weight: 600;
      color: var(--p-primary-color);
    }

    .ing-unit {
      color: var(--p-text-muted-color);
    }

    .ing-name {
      color: var(--p-text-color);
    }

    .ing-notes {
      color: var(--p-text-muted-color);
      font-style: italic;
    }

    .markdown-content {
      line-height: 1.7;
      font-size: 0.95rem;
      color: var(--p-text-color);

      :deep(h1), :deep(h2), :deep(h3) {
        margin-top: 1em;
        margin-bottom: 0.5em;
      }

      :deep(ul), :deep(ol) {
        padding-left: 24px;
      }

      :deep(blockquote) {
        border-left: 3px solid var(--p-primary-color);
        padding-left: 16px;
        margin-left: 0;
        color: var(--p-text-muted-color);
      }

      :deep(code) {
        background: var(--p-surface-800);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.85em;
      }

      :deep(hr) {
        border: none;
        border-top: 1px solid var(--p-surface-700);
        margin: 1.5em 0;
      }
    }

    .notes-text {
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--p-text-muted-color);
      margin: 0;
    }

    .photos-section {
      margin-bottom: 32px;
    }

    .photos-scroll {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      padding-bottom: 8px;
    }

    .recipe-photo {
      width: 200px;
      height: 150px;
      object-fit: cover;
      border-radius: 10px;
      flex-shrink: 0;
    }

    .chat-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 200px;
    }

    .chat-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px;
      color: var(--p-text-muted-color);
    }

    .example-prompts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }

    .chat-messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .chat-bubble {
      padding: 10px 14px;
      border-radius: 12px;
      max-width: 80%;
      font-size: 0.9rem;
      line-height: 1.5;

      &.user {
        align-self: flex-end;
        background: var(--p-primary-color);
        color: #000;
      }

      &.assistant {
        align-self: flex-start;
        background: var(--p-surface-700);
        color: var(--p-text-color);
      }
    }

    .chat-input {
      display: flex;
      gap: 8px;
      align-items: center;

      input {
        flex: 1;
      }
    }

    .ai-generate {
      display: flex;
      justify-content: center;
      padding: 24px;
    }

    .tips-content, .flavor-content {
      padding: 8px 0;

      h3 {
        font-size: 1rem;
        font-weight: 600;
        margin: 16px 0 8px;
        color: var(--p-primary-color);
      }

      ul {
        margin: 0;
        padding-left: 20px;

        li {
          margin-bottom: 6px;
          line-height: 1.5;
        }
      }
    }

    .flavor-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .flavor-description {
      line-height: 1.6;
      color: var(--p-text-muted-color);
    }

    .source-section {
      padding: 16px 0;
      border-top: 1px solid var(--p-surface-700);
      font-size: 0.85rem;
    }

    .source-label {
      color: var(--p-text-muted-color);
      margin-right: 8px;
    }

    .source-value {
      color: var(--p-text-color);
    }

    @media (max-width: 640px) {
      .recipe-title {
        font-size: 1.5rem;
      }

      .meta-strip {
        flex-direction: column;
      }
    }
  `,
})
export class RecipeDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private confirmationService = inject(ConfirmationService);
  private sanitizer = inject(DomSanitizer);
  api = inject(RecipesApiService);
  router = inject(Router);

  recipe = signal<Recipe | null>(null);
  loading = signal(true);
  currentServings = signal(1);
  displayIngredients = signal<Ingredient[]>([]);
  ingredientsLoading = signal(false);

  // AI State
  chatMessages = signal<Message[]>([]);
  chatInput = '';
  chatLoading = signal(false);
  tipsData = signal<CookingTipsResponse | null>(null);
  tipsLoading = signal(false);
  flavorData = signal<FlavorProfileResponse | null>(null);
  flavorLoading = signal(false);

  renderedInstructions = computed(() => {
    const r = this.recipe();
    if (!r?.instructions) return '';
    return this.sanitizer.bypassSecurityTrustHtml(
      marked.parse(r.instructions, { async: false }) as string
    );
  });

  examplePrompts = [
    'Can I substitute an ingredient?',
    'How do I store leftovers?',
    'What side dishes go well with this?',
  ];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getRecipe(id).subscribe((recipe) => {
      this.recipe.set(recipe);
      this.currentServings.set(recipe.servings);
      this.displayIngredients.set(recipe.ingredients);
      this.loading.set(false);
    });
  }

  adjustServings(delta: number) {
    const newServings = this.currentServings() + delta;
    if (newServings < 1) return;
    this.currentServings.set(newServings);
    this.ingredientsLoading.set(true);

    this.api
      .getScaledIngredients(this.recipe()!.id, newServings)
      .subscribe((ingredients) => {
        this.displayIngredients.set(ingredients);
        this.ingredientsLoading.set(false);
      });
  }

  formatQuantity(qty: number): string {
    return qty % 1 === 0 ? qty.toString() : qty.toFixed(2).replace(/0+$/, '');
  }

  confirmDelete() {
    this.confirmationService.confirm({
      message: 'Are you sure you want to delete this recipe?',
      header: 'Delete Recipe',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteRecipe(this.recipe()!.id).subscribe(() => {
          this.router.navigate(['/recipes']);
        });
      },
    });
  }

  sendChat(message: string) {
    if (!message.trim()) return;
    this.chatInput = '';

    const msgs = [
      ...this.chatMessages(),
      { role: 'user' as const, content: message },
    ];
    this.chatMessages.set(msgs);
    this.chatLoading.set(true);

    this.api
      .chatAboutRecipe(this.recipe()!.id, message, this.chatMessages())
      .subscribe((res) => {
        this.chatMessages.set([
          ...msgs,
          { role: 'assistant' as const, content: res.answer },
        ]);
        this.chatLoading.set(false);
      });
  }

  generateTips() {
    this.tipsLoading.set(true);
    this.api.getCookingTips(this.recipe()!.id).subscribe((tips) => {
      this.tipsData.set(tips);
      this.tipsLoading.set(false);
    });
  }

  generateFlavor() {
    this.flavorLoading.set(true);
    this.api.analyzeFlavorProfile(this.recipe()!.id).subscribe((flavor) => {
      this.flavorData.set(flavor);
      this.flavorLoading.set(false);
    });
  }
}
