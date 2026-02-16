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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
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
      display: grid;
      grid-template-columns: max-content max-content 1fr max-content;
      gap: 8px 0;
    }

    .ingredient-item {
      display: grid;
      grid-template-columns: subgrid;
      grid-column: 1 / -1;
      gap: 0 10px;
      padding: 8px 12px;
      background: var(--p-surface-800);
      border-radius: 8px;
      font-size: 0.9rem;
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
      display: flex;
      flex-direction: column;
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
