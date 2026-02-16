import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ElementRef,
  viewChild,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { TabsModule } from 'primeng/tabs';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { GalleriaModule } from 'primeng/galleria';
import { MultiSelectModule } from 'primeng/multiselect';
import { TooltipModule } from 'primeng/tooltip';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import {
  RecipesApiService,
  Recipe,
  Ingredient,
  Message,
  CookingTipsResponse,
  FlavorProfileResponse,
  RecipePhoto,
  Category,
  Tag,
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
    TabsModule,
    InputTextModule,
    ProgressSpinnerModule,
    ConfirmDialogModule,
    GalleriaModule,
    MultiSelectModule,
    TooltipModule,
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
      <div class="chips-section">
        @if (!editingChips()) { @for (cat of recipe()!.categories; track cat.id)
        {
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
        } @if (recipe()!.categories.length === 0 && recipe()!.tags.length === 0)
        {
        <span class="no-chips-hint">No categories or tags</span>
        }
        <p-button
          icon="pi pi-pencil"
          [rounded]="true"
          [text]="true"
          severity="secondary"
          size="small"
          pTooltip="Edit categories & tags"
          tooltipPosition="top"
          (click)="startEditingChips()"
        />
        } @else {
        <div class="chips-edit-panel">
          <div class="chips-edit-row">
            <label>Categories</label>
            <p-multiselect
              [options]="allCategories()"
              [(ngModel)]="selectedCategoryIds"
              optionLabel="name"
              optionValue="id"
              placeholder="Select categories"
              display="chip"
              [filter]="true"
              filterPlaceholder="Search..."
              [fluid]="true"
            />
          </div>
          <div class="chips-edit-row">
            <label>Tags</label>
            <p-multiselect
              [options]="allTags()"
              [(ngModel)]="selectedTagIds"
              optionLabel="name"
              optionValue="id"
              placeholder="Select tags"
              display="chip"
              [filter]="true"
              filterPlaceholder="Search..."
              [fluid]="true"
            />
          </div>
          <div class="chips-edit-actions">
            <p-button
              label="Cancel"
              severity="secondary"
              [text]="true"
              size="small"
              (click)="cancelEditingChips()"
            />
            <p-button
              label="Save"
              icon="pi pi-check"
              size="small"
              (click)="saveChips()"
              [loading]="savingChips()"
            />
          </div>
        </div>
        }
      </div>

      <!-- Photos -->
      <div class="photos-section">
        <div class="photos-section-header">
          <h2 class="section-title">Photos</h2>
          <div class="photos-actions">
            <input
              type="file"
              accept="image/*"
              (change)="onFileSelected($event)"
              #fileInput
              style="display: none"
            />
            <p-button
              icon="pi pi-upload"
              label="Upload"
              severity="secondary"
              [outlined]="true"
              size="small"
              (click)="fileInput.click()"
              [loading]="uploadLoading()"
            />
          </div>
        </div>
        @if (galleryImages().length > 0) {
        <p-galleria
          [value]="galleryImages()"
          [numVisible]="5"
          [showItemNavigators]="true"
          [showItemNavigatorsOnHover]="true"
          [circular]="true"
          [showThumbnails]="galleryImages().length > 1"
          [containerStyle]="{ 'max-width': '100%' }"
          [responsiveOptions]="galleriaResponsiveOptions"
        >
          <ng-template #item let-item>
            <div class="galleria-item-wrapper">
              <img
                [src]="item.itemImageSrc"
                [alt]="item.alt"
                style="width: 100%; display: block; border-radius: 8px;"
              />
              <p-button
                icon="pi pi-trash"
                severity="danger"
                [rounded]="true"
                size="small"
                class="galleria-delete-btn"
                pTooltip="Delete photo"
                tooltipPosition="left"
                (click)="confirmDeletePhoto(item.photoId)"
              />
            </div>
          </ng-template>
          <ng-template #thumbnail let-item>
            <img
              [src]="item.thumbnailImageSrc"
              [alt]="item.alt"
              style="display: block; width: 100%; border-radius: 4px;"
            />
          </ng-template>
          <ng-template #caption let-item>
            <div class="galleria-caption">
              {{ activeGalleryIndex() + 1 }} / {{ galleryImages().length }}
            </div>
          </ng-template>
        </p-galleria>
        } @else {
        <div class="photos-empty">
          <i class="pi pi-image"></i>
          <p>No photos yet. Upload one to get started!</p>
        </div>
        }
      </div>

      <!-- Recipe Body - Two Column Layout -->
      <div class="recipe-body">
        <!-- Left: Ingredients -->
        <div class="recipe-body-left">
          <div class="ingredients-card">
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
        </div>

        <!-- Right: Instructions & Notes -->
        <div class="recipe-body-right">
          @if (recipe()!.instructions) {
          <div class="section">
            <h2 class="section-title">Instructions</h2>
            <div
              class="markdown-content"
              [innerHTML]="renderedInstructions()"
            ></div>
          </div>
          } @if (recipe()!.notes) {
          <div class="section notes-card">
            <h2 class="section-title">
              <i class="pi pi-bookmark"></i> Personal Notes
            </h2>
            <p class="notes-text">{{ recipe()!.notes }}</p>
          </div>
          }
        </div>
      </div>

      <!-- AI Assistant — integrated as a sidebar-style panel -->
      <div class="ai-section">
        <div class="ai-header" (click)="toggleAiPanel()">
          <div class="ai-header-left">
            <i class="pi pi-sparkles"></i>
            <span class="ai-header-title">AI Assistant</span>
          </div>
          <i
            class="pi"
            [class.pi-chevron-down]="!aiPanelOpen()"
            [class.pi-chevron-up]="aiPanelOpen()"
          ></i>
        </div>

        @if (aiPanelOpen()) {
        <div class="ai-body">
          <!-- Quick Actions Row -->
          <div class="ai-quick-actions">
            <button
              class="ai-action-btn"
              [class.active]="aiTab() === 'chat'"
              (click)="aiTab.set('chat')"
            >
              <i class="pi pi-comments"></i>
              <span>Chat</span>
            </button>
            <button
              class="ai-action-btn"
              [class.active]="aiTab() === 'tips'"
              (click)="switchToTips()"
            >
              <i class="pi pi-lightbulb"></i>
              <span>Tips</span>
            </button>
            <button
              class="ai-action-btn"
              [class.active]="aiTab() === 'flavor'"
              (click)="switchToFlavor()"
            >
              <i class="pi pi-palette"></i>
              <span>Flavor</span>
            </button>
          </div>

          <!-- Chat Panel -->
          @if (aiTab() === 'chat') {
          <div class="chat-panel">
            @if (chatMessages().length === 0 && !chatLoading()) {
            <div class="chat-welcome">
              <p class="chat-welcome-text">Ask me anything about this recipe</p>
              <div class="suggestion-chips">
                @for (prompt of examplePrompts; track prompt) {
                <button class="suggestion-chip" (click)="sendChat(prompt)">
                  {{ prompt }}
                </button>
                }
              </div>
            </div>
            } @else {
            <div class="chat-messages" #chatMessagesEl>
              @for (msg of chatMessages(); track $index) {
              <div
                class="chat-msg"
                [class.user]="msg.role === 'user'"
                [class.assistant]="msg.role === 'assistant'"
              >
                @if (msg.role === 'user') {
                <div class="chat-msg-content">{{ msg.content }}</div>
                } @else {
                <div
                  class="chat-msg-content markdown-content"
                  [innerHTML]="renderMarkdown(msg.content)"
                ></div>
                }
              </div>
              } @if (streamingContent()) {
              <div class="chat-msg assistant">
                <div
                  class="chat-msg-content markdown-content"
                  [innerHTML]="renderMarkdown(streamingContent())"
                ></div>
              </div>
              } @if (chatLoading() && !streamingContent()) {
              <div class="chat-msg assistant">
                <div class="chat-msg-content typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
              }
            </div>
            }
            <div class="chat-input-bar">
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
                size="small"
                (click)="sendChat(chatInput)"
                [loading]="chatLoading()"
                [disabled]="!chatInput.trim()"
              />
            </div>
          </div>
          }

          <!-- Tips Panel -->
          @if (aiTab() === 'tips') {
          <div class="ai-content-panel">
            @if (tipsLoading()) {
            <div class="ai-loading">
              <p-progress-spinner
                [style]="{ width: '28px', height: '28px' }"
                ariaLabel="Loading"
              />
              <span>Generating cooking tips...</span>
            </div>
            } @else if (tipsData()) {
            <div class="tips-grid">
              <div class="tips-section">
                <div class="tips-section-header">
                  <i class="pi pi-check-circle"></i>
                  <h4>Pro Tips</h4>
                </div>
                @for (tip of tipsData()!.tips; track $index) {
                <div class="tip-card">
                  <span class="tip-number">{{ $index + 1 }}</span>
                  <p>{{ tip }}</p>
                </div>
                }
              </div>
              <div class="tips-section">
                <div class="tips-section-header">
                  <i class="pi pi-exclamation-triangle"></i>
                  <h4>Common Mistakes</h4>
                </div>
                @for (mistake of tipsData()!.commonMistakes; track $index) {
                <div class="tip-card mistake">
                  <span class="tip-number">{{ $index + 1 }}</span>
                  <p>{{ mistake }}</p>
                </div>
                }
              </div>
            </div>
            }
          </div>
          }

          <!-- Flavor Panel -->
          @if (aiTab() === 'flavor') {
          <div class="ai-content-panel">
            @if (flavorLoading()) {
            <div class="ai-loading">
              <p-progress-spinner
                [style]="{ width: '28px', height: '28px' }"
                ariaLabel="Loading"
              />
              <span>Analyzing flavor profile...</span>
            </div>
            } @else if (flavorData()) {
            <div class="flavor-profile">
              <div class="flavor-tags">
                @for (flavor of flavorData()!.primaryFlavors; track flavor) {
                <span class="flavor-tag">{{ flavor }}</span>
                }
              </div>
              <p class="flavor-description">{{ flavorData()!.tasteProfile }}</p>
              <div class="pairings">
                <h4><i class="pi pi-heart"></i> Pairs Well With</h4>
                <div class="pairings-list">
                  @for (rec of flavorData()!.pairingRecommendations; track
                  $index) {
                  <div class="pairing-item">
                    <i class="pi pi-circle-fill"></i>
                    <span>{{ rec }}</span>
                  </div>
                  }
                </div>
              </div>
            </div>
            }
          </div>
          }
        </div>
        }
      </div>
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
      max-width: 1800px;
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
      font-size: 2.2rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: var(--p-text-color);
      letter-spacing: -0.02em;
    }

    .recipe-description {
      font-size: 1.05rem;
      color: var(--p-text-muted-color);
      margin: 0 0 24px;
      line-height: 1.6;
      max-width: 800px;
    }

    .meta-strip {
      display: flex;
      gap: 12px;
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
      align-items: center;
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

    .no-chips-hint {
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
      font-style: italic;
    }

    .chips-edit-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      padding: 16px;
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
    }

    .chips-edit-row {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--p-text-muted-color);
      }
    }

    .chips-edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
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

      i {
        font-size: 1rem;
        color: var(--p-primary-color);
      }
    }

    // ===== TWO-COLUMN LAYOUT =====
    .recipe-body {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 48px;
      align-items: start;
      margin-bottom: 32px;
    }

    .recipe-body-left {
      position: sticky;
      top: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .ingredients-card {
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
      padding: 24px;

      .section-title {
        margin-bottom: 12px;
      }

      .ingredient-list {
        gap: 4px 0;
      }

      .ingredient-item {
        background: var(--p-surface-800);
      }
    }

    .recipe-body-right {
      min-width: 0;
    }

    .instructions-section {
      .section-title {
        margin-bottom: 20px;
      }
    }

    .instructions-content {
      :deep(ol) {
        padding-left: 0;
        list-style: none;
        counter-reset: step-counter;

        li {
          counter-increment: step-counter;
          position: relative;
          padding: 12px 16px 12px 48px;
          margin-bottom: 8px;
          background: var(--p-surface-900);
          border: 1px solid var(--p-surface-700);
          border-radius: 10px;
          line-height: 1.7;

          &::before {
            content: counter(step-counter);
            position: absolute;
            left: 12px;
            top: 12px;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: var(--p-primary-color);
            color: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: 700;
            flex-shrink: 0;
          }
        }
      }
    }

    .notes-card {
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
      padding: 20px;

      .section-title {
        margin-bottom: 12px;
      }
    }

    .source-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
      font-size: 0.85rem;

      .source-label {
        color: var(--p-text-muted-color);
        font-weight: 500;
        white-space: nowrap;
      }

      .source-value {
        color: var(--p-text-color);
        word-break: break-word;
      }
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
      display: grid;
      grid-template-columns: max-content max-content 1fr max-content;
      gap: 8px 0;
    }

    .ingredient-item {
      display: grid;
      grid-template-columns: subgrid;
      grid-column: 1 / -1;
      gap: 0 10px;
      padding: 10px 14px;
      background: var(--p-surface-800);
      border-radius: 8px;
      font-size: 0.9rem;
      transition: background 0.15s;

      &:hover {
        background: var(--p-surface-700);
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
      color: var(--p-text-color);
      font-weight: 600;
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

    .photos-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      .section-title {
        margin-bottom: 0;
      }
    }

    .photos-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .galleria-item-wrapper {
      position: relative;
      width: 100%;
    }

    .galleria-delete-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .galleria-item-wrapper:hover .galleria-delete-btn {
      opacity: 1;
    }

    :host ::ng-deep .p-galleria {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--p-surface-700);
    }

    :host ::ng-deep .p-galleria-thumbnail-items img {
      height: 60px;
      object-fit: cover;
    }

    .galleria-caption {
      text-align: center;
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
    }

    .photos-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      border: 2px dashed var(--p-surface-600);
      border-radius: 12px;
      color: var(--p-text-muted-color);
      gap: 12px;

      i {
        font-size: 2rem;
        opacity: 0.5;
      }

      p {
        margin: 0;
        font-size: 0.9rem;
      }
    }

    // ===== AI SECTION =====
    .ai-section {
      margin-bottom: 32px;
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
      overflow: hidden;
      background: var(--p-surface-900);
    }

    .ai-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 20px;
      cursor: pointer;
      user-select: none;
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.08), transparent);

      &:hover {
        background: linear-gradient(135deg, rgba(249, 115, 22, 0.12), transparent);
      }
    }

    .ai-header-left {
      display: flex;
      align-items: center;
      gap: 10px;

      i {
        color: var(--p-primary-color);
        font-size: 1.1rem;
      }
    }

    .ai-header-title {
      font-weight: 600;
      font-size: 0.95rem;
    }

    .ai-body {
      border-top: 1px solid var(--p-surface-700);
    }

    .ai-quick-actions {
      display: flex;
      border-bottom: 1px solid var(--p-surface-700);
    }

    .ai-action-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      background: none;
      border: none;
      color: var(--p-text-muted-color);
      cursor: pointer;
      font-size: 0.85rem;
      font-family: inherit;
      transition: all 0.15s;
      border-bottom: 2px solid transparent;

      i {
        font-size: 0.9rem;
      }

      &:hover {
        color: var(--p-text-color);
        background: var(--p-surface-800);
      }

      &.active {
        color: var(--p-primary-color);
        border-bottom-color: var(--p-primary-color);
        background: rgba(249, 115, 22, 0.06);
      }
    }

    // ===== CHAT =====
    .chat-panel {
      display: flex;
      flex-direction: column;
      min-height: 200px;
      max-height: 500px;
    }

    .chat-welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px 20px;
      flex: 1;
    }

    .chat-welcome-text {
      color: var(--p-text-muted-color);
      font-size: 0.9rem;
      margin: 0;
    }

    .suggestion-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }

    .suggestion-chip {
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid var(--p-surface-600);
      background: var(--p-surface-800);
      color: var(--p-text-color);
      font-size: 0.8rem;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;

      &:hover {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
        background: rgba(249, 115, 22, 0.08);
      }
    }

    .chat-messages {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px 20px;
      overflow-y: auto;
      flex: 1;
    }

    .chat-msg {
      display: flex;

      &.user {
        justify-content: flex-end;

        .chat-msg-content {
          background: var(--p-primary-color);
          color: #000;
          border-radius: 14px 14px 4px 14px;
        }
      }

      &.assistant {
        justify-content: flex-start;

        .chat-msg-content {
          background: var(--p-surface-800);
          color: var(--p-text-color);
          border-radius: 14px 14px 14px 4px;
        }
      }
    }

    .chat-msg-content {
      padding: 10px 14px;
      max-width: 85%;
      font-size: 0.88rem;
      line-height: 1.6;

      &.markdown-content {
        :deep(p) {
          margin: 0 0 8px;
          &:last-child { margin: 0; }
        }
        :deep(strong) { font-weight: 600; }
        :deep(ul), :deep(ol) {
          margin: 4px 0;
          padding-left: 20px;
        }
        :deep(li) { margin-bottom: 2px; }
        :deep(code) {
          background: rgba(0, 0, 0, 0.2);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.85em;
        }
      }
    }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 12px 16px !important;

      span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--p-text-muted-color);
        animation: typingBounce 1.2s infinite;

        &:nth-child(2) { animation-delay: 0.2s; }
        &:nth-child(3) { animation-delay: 0.4s; }
      }
    }

    @keyframes typingBounce {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }

    .chat-input-bar {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 12px 16px;
      border-top: 1px solid var(--p-surface-700);
      background: var(--p-surface-800);

      input {
        flex: 1;
      }
    }

    // ===== TIPS =====
    .ai-content-panel {
      padding: 20px;
    }

    .ai-loading {
      display: flex;
      align-items: center;
      gap: 12px;
      justify-content: center;
      padding: 32px 0;
      color: var(--p-text-muted-color);
      font-size: 0.9rem;
    }

    .tips-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .tips-section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;

      i {
        color: var(--p-primary-color);
        font-size: 0.95rem;
      }

      h4 {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 600;
      }
    }

    .tips-section-header:has(.pi-exclamation-triangle) i {
      color: var(--p-orange-400);
    }

    .tip-card {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 10px 14px;
      border-radius: 8px;
      background: var(--p-surface-800);
      margin-bottom: 6px;

      p {
        margin: 0;
        font-size: 0.88rem;
        line-height: 1.5;
        color: var(--p-text-color);
      }

      &.mistake {
        border-left: 3px solid var(--p-orange-400);
      }
    }

    .tip-number {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--p-surface-600);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--p-text-color);
    }

    // ===== FLAVOR =====
    .flavor-profile {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .flavor-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .flavor-tag {
      padding: 5px 14px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(249, 115, 22, 0.05));
      border: 1px solid rgba(249, 115, 22, 0.3);
      color: var(--p-primary-color);
      font-size: 0.82rem;
      font-weight: 500;
    }

    .flavor-description {
      line-height: 1.6;
      color: var(--p-text-muted-color);
      font-size: 0.9rem;
      margin: 0;
    }

    .pairings {
      h4 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9rem;
        font-weight: 600;
        margin: 0 0 10px;
        color: var(--p-text-color);

        i {
          color: var(--p-primary-color);
          font-size: 0.8rem;
        }
      }
    }

    .pairings-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .pairing-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: var(--p-surface-800);
      border-radius: 8px;
      font-size: 0.88rem;

      i {
        font-size: 0.35rem;
        color: var(--p-primary-color);
      }
    }

    // ===== RESPONSIVE: Tablet =====
    @media (max-width: 1024px) {
      .recipe-body {
        grid-template-columns: 1fr;
        gap: 24px;
      }

      .recipe-body-left {
        position: static;
      }

      .tips-grid {
        grid-template-columns: 1fr;
      }

    }

    // ===== RESPONSIVE: Mobile =====
    @media (max-width: 640px) {
      .recipe-detail {
        margin: 0 -4px;
      }

      .recipe-title {
        font-size: 1.5rem;
      }

      .recipe-description {
        font-size: 0.95rem;
      }

      .meta-strip {
        gap: 8px;
      }

      .meta-badge {
        padding: 8px 12px;
        flex: 1;
        min-width: 0;
        justify-content: center;
      }

      .ingredients-card {
        padding: 16px;
        border-radius: 10px;
      }

      .ingredient-list {
        grid-template-columns: max-content max-content 1fr;
      }

      .ingredient-item {
        padding: 8px 10px;
        font-size: 0.85rem;
        grid-template-columns: subgrid;
        grid-column: 1 / -1;
      }

      .ing-notes {
        grid-column: 1 / -1;
        padding-left: 0;
        font-size: 0.8rem;
      }

      .notes-card {
        padding: 16px;
        border-radius: 10px;
      }

      .detail-header {
        flex-wrap: wrap;
        gap: 8px;
      }

      .instructions-content {
        :deep(ol li) {
          padding: 10px 12px 10px 42px;

          &::before {
            left: 10px;
            top: 10px;
            width: 22px;
            height: 22px;
            font-size: 0.7rem;
          }
        }
      }

      .recipe-body {
        gap: 16px;
      }

      .ai-quick-actions {
        span {
          display: none;
        }
      }

      .chat-msg-content {
        max-width: 92%;
      }
    }
  `,
})
export class RecipeDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private confirmationService = inject(ConfirmationService);
  private sanitizer = inject(DomSanitizer);
  api = inject(RecipesApiService);
  router = inject(Router);

  chatMessagesEl = viewChild<ElementRef>('chatMessagesEl');

  recipe = signal<Recipe | null>(null);
  loading = signal(true);
  currentServings = signal(1);
  displayIngredients = signal<Ingredient[]>([]);
  ingredientsLoading = signal(false);

  // Photo state
  uploadLoading = signal(false);
  activeGalleryIndex = signal(0);

  // Categories & Tags editing state
  allCategories = signal<Category[]>([]);
  allTags = signal<Tag[]>([]);
  editingChips = signal(false);
  savingChips = signal(false);
  selectedCategoryIds: string[] = [];
  selectedTagIds: string[] = [];

  galleryImages = computed(() => {
    const r = this.recipe();
    if (!r?.photos?.length) return [];
    return r.photos.map((photo) => ({
      itemImageSrc: this.api.getPhotoUrl(photo.id),
      thumbnailImageSrc: this.api.getPhotoUrl(photo.id),
      alt: r.title,
      photoId: photo.id,
    }));
  });

  galleriaResponsiveOptions = [
    { breakpoint: '1024px', numVisible: 5 },
    { breakpoint: '768px', numVisible: 3 },
    { breakpoint: '560px', numVisible: 2 },
  ];

  // AI State
  aiPanelOpen = signal(false);
  aiTab = signal<'chat' | 'tips' | 'flavor'>('chat');
  chatMessages = signal<Message[]>([]);
  chatInput = '';
  chatLoading = signal(false);
  streamingContent = signal('');
  tipsData = signal<CookingTipsResponse | null>(null);
  tipsLoading = signal(false);
  flavorData = signal<FlavorProfileResponse | null>(null);
  flavorLoading = signal(false);

  private streamSub: Subscription | null = null;

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
    'What side dishes pair well?',
    'Any tips for beginners?',
  ];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getRecipe(id).subscribe((recipe) => {
      this.recipe.set(recipe);
      this.currentServings.set(recipe.servings);
      this.displayIngredients.set(recipe.ingredients);
      this.loading.set(false);
    });

    // Pre-load all categories and tags for inline editing
    this.api.getCategories().subscribe((cats) => this.allCategories.set(cats));
    this.api.getTags().subscribe((tags) => this.allTags.set(tags));
  }

  ngOnDestroy() {
    this.streamSub?.unsubscribe();
  }

  toggleAiPanel() {
    this.aiPanelOpen.update((v) => !v);
  }

  switchToTips() {
    this.aiTab.set('tips');
    if (!this.tipsData() && !this.tipsLoading()) {
      this.generateTips();
    }
  }

  switchToFlavor() {
    this.aiTab.set('flavor');
    if (!this.flavorData() && !this.flavorLoading()) {
      this.generateFlavor();
    }
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

  startEditingChips() {
    const r = this.recipe();
    if (!r) return;
    this.selectedCategoryIds = r.categories.map((c) => c.id);
    this.selectedTagIds = r.tags.map((t) => t.id);
    this.editingChips.set(true);
  }

  cancelEditingChips() {
    this.editingChips.set(false);
  }

  saveChips() {
    const r = this.recipe();
    if (!r) return;
    this.savingChips.set(true);

    this.api
      .updateRecipe(r.id, {
        categoryIds: this.selectedCategoryIds,
        tagIds: this.selectedTagIds,
      })
      .subscribe({
        next: (updated) => {
          this.recipe.update((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              categories: updated.categories,
              tags: updated.tags,
            };
          });
          this.savingChips.set(false);
          this.editingChips.set(false);
        },
        error: () => {
          this.savingChips.set(false);
        },
      });
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

  renderMarkdown(content: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      marked.parse(content, { async: false }) as string
    );
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadLoading.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      this.api
        .uploadPhoto(this.recipe()!.id, {
          filename: file.name,
          mimeType: file.type,
          data: base64,
        })
        .subscribe({
          next: (photo) => {
            this.recipe.update((r) => {
              if (!r) return r;
              return {
                ...r,
                photos: [...(r.photos || []), photo],
              };
            });
            this.uploadLoading.set(false);
            input.value = '';
          },
          error: () => {
            this.uploadLoading.set(false);
            input.value = '';
          },
        });
    };
    reader.readAsDataURL(file);
  }

  confirmDeletePhoto(photoId: string) {
    this.confirmationService.confirm({
      message: 'Delete this photo?',
      header: 'Confirm',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deletePhoto(photoId).subscribe(() => {
          this.recipe.update((r) => {
            if (!r) return r;
            return {
              ...r,
              photos: (r.photos || []).filter((p) => p.id !== photoId),
            };
          });
        });
      },
    });
  }

  sendChat(message: string) {
    if (!message.trim() || this.chatLoading()) return;
    this.chatInput = '';

    const userMsg: Message = { role: 'user', content: message };
    const currentMessages = [...this.chatMessages(), userMsg];
    this.chatMessages.set(currentMessages);
    this.chatLoading.set(true);
    this.streamingContent.set('');

    // Cancel any previous stream
    this.streamSub?.unsubscribe();

    let accumulated = '';

    this.streamSub = this.api
      .chatAboutRecipeStream(
        this.recipe()!.id,
        message,
        // Send history without the current user message (backend adds it)
        this.chatMessages().slice(0, -1)
      )
      .subscribe({
        next: (chunk) => {
          accumulated += chunk.token;
          this.streamingContent.set(accumulated);
          this.scrollChatToBottom();
        },
        complete: () => {
          // Move streamed content into permanent messages
          this.chatMessages.update((msgs) => [
            ...msgs,
            { role: 'assistant', content: accumulated },
          ]);
          this.streamingContent.set('');
          this.chatLoading.set(false);
          this.scrollChatToBottom();
        },
        error: () => {
          // Fallback: store whatever we got
          if (accumulated) {
            this.chatMessages.update((msgs) => [
              ...msgs,
              { role: 'assistant', content: accumulated },
            ]);
          } else {
            this.chatMessages.update((msgs) => [
              ...msgs,
              {
                role: 'assistant',
                content: 'Sorry, something went wrong. Please try again.',
              },
            ]);
          }
          this.streamingContent.set('');
          this.chatLoading.set(false);
        },
      });

    this.scrollChatToBottom();
  }

  generateTips() {
    this.tipsLoading.set(true);
    this.api.getCookingTips(this.recipe()!.id).subscribe({
      next: (tips) => {
        this.tipsData.set(tips);
        this.tipsLoading.set(false);
      },
      error: () => {
        this.tipsLoading.set(false);
      },
    });
  }

  generateFlavor() {
    this.flavorLoading.set(true);
    this.api.analyzeFlavorProfile(this.recipe()!.id).subscribe({
      next: (flavor) => {
        this.flavorData.set(flavor);
        this.flavorLoading.set(false);
      },
      error: () => {
        this.flavorLoading.set(false);
      },
    });
  }

  private scrollChatToBottom() {
    requestAnimationFrame(() => {
      const el = this.chatMessagesEl()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
