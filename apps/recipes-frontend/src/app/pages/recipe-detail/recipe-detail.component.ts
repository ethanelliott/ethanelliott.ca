import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { FormsModule } from '@angular/forms';
import {
  RecipesApiService,
  Recipe,
  Ingredient,
  Message,
  CookingTipsResponse,
  FlavorProfileResponse,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-recipe-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatDialogModule,
    MatInputModule,
    MatFormFieldModule,
    MatTabsModule,
    MatExpansionModule,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
    <div class="loading">
      <mat-spinner diameter="48"></mat-spinner>
    </div>
    } @else if (recipe()) {
    <div class="recipe-detail">
      <div class="header">
        <div class="header-content">
          <button mat-icon-button routerLink="/recipes" class="back-btn">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div class="header-text">
            <h1>{{ recipe()!.title }}</h1>
            @if (recipe()!.description) {
            <p class="description">{{ recipe()!.description }}</p>
            }
          </div>
        </div>
        <div class="header-actions">
          <button
            mat-button
            [routerLink]="['/recipes', recipe()!.id, 'edit']"
            class="action-btn"
          >
            <mat-icon>edit</mat-icon>
            Edit
          </button>
          <button
            mat-button
            color="warn"
            (click)="deleteRecipe()"
            class="action-btn delete-btn"
          >
            <mat-icon>delete</mat-icon>
            Delete
          </button>
        </div>
      </div>

      <div class="meta-strip">
        @if (recipe()!.prepTimeMinutes) {
        <div class="meta-badge prep">
          <mat-icon>hourglass_top</mat-icon>
          <div class="meta-text">
            <span class="meta-value">{{ recipe()!.prepTimeMinutes }}</span>
            <span class="meta-label">min prep</span>
          </div>
        </div>
        } @if (recipe()!.cookTimeMinutes) {
        <div class="meta-badge cook">
          <mat-icon>local_fire_department</mat-icon>
          <div class="meta-text">
            <span class="meta-value">{{ recipe()!.cookTimeMinutes }}</span>
            <span class="meta-label">min cook</span>
          </div>
        </div>
        }
        <div class="meta-badge servings">
          <mat-icon>people</mat-icon>
          <div class="meta-text">
            <span class="meta-value">{{ recipe()!.servings }}</span>
            <span class="meta-label">servings</span>
          </div>
        </div>
      </div>

      @if (recipe()!.categories.length > 0 || recipe()!.tags.length > 0) {
      <div class="chips-row">
        @for (category of recipe()!.categories; track category.id) {
        <span
          class="chip category-chip"
          [style.background-color]="category.color || '#666'"
        >
          {{ category.name }}
        </span>
        } @for (tag of recipe()!.tags; track tag.id) {
        <span
          class="chip tag-chip"
          [style.border-color]="tag.color || '#666'"
          [style.color]="tag.color || '#666'"
        >
          {{ tag.name }}
        </span>
        }
      </div>
      }

      <!-- Photos -->
      @if (recipe()!.photos && recipe()!.photos!.length > 0) {
      <div class="photos-section">
        <h2><mat-icon>photo_library</mat-icon> Photos</h2>
        <div class="photos-grid">
          @for (photo of recipe()!.photos; track photo.id) {
          <img
            [src]="getPhotoUrl(photo.id)"
            [alt]="photo.filename"
            class="recipe-photo"
          />
          }
        </div>
      </div>
      }

      <div class="content-grid">
        <!-- Ingredients -->
        <div class="section-card ingredients-section">
          <div class="section-header">
            <h2><mat-icon>format_list_bulleted</mat-icon> Ingredients</h2>
            <div class="servings-adjuster">
              <button
                mat-mini-fab
                (click)="adjustServings(-1)"
                [disabled]="currentServings() <= 1"
                class="adj-btn"
              >
                <mat-icon>remove</mat-icon>
              </button>
              <span class="servings-display">{{ currentServings() }}</span>
              <button mat-mini-fab (click)="adjustServings(1)" class="adj-btn">
                <mat-icon>add</mat-icon>
              </button>
            </div>
          </div>
          <ul class="ingredients-list">
            @for (ingredient of scaledIngredients(); track ingredient.id) {
            <li>
              <span class="quantity">{{
                formatQuantity(ingredient.quantity)
              }}</span>
              <span class="unit">{{ ingredient.unit }}</span>
              <span class="name">{{ ingredient.name }}</span>
              @if (ingredient.notes) {
              <span class="notes">({{ ingredient.notes }})</span>
              }
            </li>
            }
          </ul>
        </div>

        <!-- Instructions -->
        <div class="section-card instructions-section">
          <div class="section-header">
            <h2><mat-icon>menu_book</mat-icon> Instructions</h2>
          </div>
          @if (recipe()!.instructions) {
          <div
            class="instructions-content"
            [innerHTML]="formatInstructions(recipe()!.instructions!)"
          ></div>
          } @else {
          <p class="no-instructions">No instructions provided.</p>
          }
        </div>
      </div>

      @if (recipe()!.notes) {
      <div class="section-card notes-section">
        <div class="section-header">
          <h2><mat-icon>note</mat-icon> Personal Notes</h2>
        </div>
        <p class="notes-content">{{ recipe()!.notes }}</p>
      </div>
      }

      <!-- AI Assistant Section -->
      <mat-expansion-panel class="ai-panel">
        <mat-expansion-panel-header>
          <mat-panel-title>
            <mat-icon class="ai-icon">auto_awesome</mat-icon>
            AI Assistant
          </mat-panel-title>
          <mat-panel-description>
            Get cooking tips, flavor analysis, and ask questions
          </mat-panel-description>
        </mat-expansion-panel-header>

        <mat-tab-group class="ai-tabs" animationDuration="200ms">
          <!-- Chat Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>chat</mat-icon>
              Ask
            </ng-template>
            <div class="ai-tab-content">
              <div class="chat-container">
                @if (chatMessages().length > 0) {
                <div class="chat-messages">
                  @for (msg of chatMessages(); track $index) { @if (msg.role !==
                  'system') {
                  <div class="chat-message" [class.user]="msg.role === 'user'">
                    <div class="message-bubble">
                      {{ msg.content }}
                    </div>
                  </div>
                  } }
                </div>
                } @else {
                <div class="chat-empty">
                  <mat-icon>lightbulb</mat-icon>
                  <p>Ask anything about this recipe!</p>
                  <span class="examples">Try: "What can I substitute for...?" or "How do I know when it's done?"</span>
                </div>
                }

                <div class="chat-input-row">
                  <mat-form-field appearance="outline" class="chat-input">
                    <input
                      matInput
                      [ngModel]="chatQuestion()"
                      (ngModelChange)="chatQuestion.set($event)"
                      placeholder="Ask a question about this recipe..."
                      (keyup.enter)="askQuestion()"
                      [disabled]="chatLoading()"
                    />
                  </mat-form-field>
                  <button
                    mat-fab
                    color="primary"
                    (click)="askQuestion()"
                    [disabled]="!chatQuestion() || chatLoading()"
                    class="send-btn"
                  >
                    @if (chatLoading()) {
                    <mat-spinner diameter="24"></mat-spinner>
                    } @else {
                    <mat-icon>send</mat-icon>
                    }
                  </button>
                </div>
              </div>
            </div>
          </mat-tab>

          <!-- Cooking Tips Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>tips_and_updates</mat-icon>
              Tips
            </ng-template>
            <div class="ai-tab-content">
              @if (!cookingTips() && !tipsLoading()) {
              <div class="load-prompt">
                <mat-icon>tips_and_updates</mat-icon>
                <p>Get expert cooking tips for this recipe</p>
                <button mat-raised-button color="primary" (click)="loadCookingTips()">
                  <mat-icon>auto_awesome</mat-icon>
                  Generate Tips
                </button>
              </div>
              } @else if (tipsLoading()) {
              <div class="ai-loading">
                <mat-spinner diameter="32"></mat-spinner>
                <p>Analyzing recipe...</p>
              </div>
              } @else if (cookingTips()) {
              <div class="tips-content">
                <div class="tips-section">
                  <h4><mat-icon>check_circle</mat-icon> Pro Tips</h4>
                  <ul>
                    @for (tip of cookingTips()!.tips; track $index) {
                    <li>{{ tip }}</li>
                    }
                  </ul>
                </div>
                <div class="tips-section mistakes">
                  <h4><mat-icon>warning</mat-icon> Common Mistakes to Avoid</h4>
                  <ul>
                    @for (mistake of cookingTips()!.commonMistakes; track $index) {
                    <li>{{ mistake }}</li>
                    }
                  </ul>
                </div>
              </div>
              }
            </div>
          </mat-tab>

          <!-- Flavor Profile Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>restaurant</mat-icon>
              Flavor
            </ng-template>
            <div class="ai-tab-content">
              @if (!flavorProfile() && !flavorLoading()) {
              <div class="load-prompt">
                <mat-icon>restaurant</mat-icon>
                <p>Discover the flavor profile and pairings</p>
                <button mat-raised-button color="primary" (click)="loadFlavorProfile()">
                  <mat-icon>auto_awesome</mat-icon>
                  Analyze Flavors
                </button>
              </div>
              } @else if (flavorLoading()) {
              <div class="ai-loading">
                <mat-spinner diameter="32"></mat-spinner>
                <p>Analyzing flavors...</p>
              </div>
              } @else if (flavorProfile()) {
              <div class="flavor-content">
                <div class="flavor-chips">
                  @for (flavor of flavorProfile()!.primaryFlavors; track flavor) {
                  <span class="flavor-chip">{{ flavor }}</span>
                  }
                </div>
                <p class="taste-description">{{ flavorProfile()!.tasteProfile }}</p>
                <div class="pairings">
                  <h4><mat-icon>wine_bar</mat-icon> Pairing Recommendations</h4>
                  <ul>
                    @for (pairing of flavorProfile()!.pairingRecommendations; track $index) {
                    <li>{{ pairing }}</li>
                    }
                  </ul>
                </div>
              </div>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-expansion-panel>

      @if (recipe()!.source) {
      <p class="source">
        <mat-icon>link</mat-icon>
        Source: {{ recipe()!.source }}
      </p>
      }
    </div>
    }
  `,
  styles: `
    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-3xl);
    }

    .recipe-detail {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--spacing-xl);
      gap: var(--spacing-lg);
    }

    .header-content {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-md);
      flex: 1;
    }

    .back-btn {
      margin-top: 4px;
      background: rgba(255, 255, 255, 0.05);
    }

    .header-text h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .description {
      font-size: 1rem;
      color: rgba(255, 255, 255, 0.6);
      margin: var(--spacing-sm) 0 0;
      line-height: 1.5;
    }

    .header-actions {
      display: flex;
      gap: var(--spacing-sm);
      flex-shrink: 0;
    }

    .action-btn {
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-sm);
    }

    .delete-btn:hover {
      background: rgba(239, 68, 68, 0.1);
    }

    .meta-strip {
      display: flex;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-xl);
    }

    .meta-badge {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) var(--spacing-lg);
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-md);
    }

    .meta-badge mat-icon {
      opacity: 0.6;
    }

    .meta-badge.prep mat-icon { color: #3b82f6; opacity: 1; }
    .meta-badge.cook mat-icon { color: #ef4444; opacity: 1; }
    .meta-badge.servings mat-icon { color: #8b5cf6; opacity: 1; }

    .meta-text {
      display: flex;
      flex-direction: column;
    }

    .meta-value {
      font-size: 1.25rem;
      font-weight: 600;
      line-height: 1;
    }

    .meta-label {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-xl);
    }

    .chip {
      padding: 6px 14px;
      border-radius: var(--border-radius-full);
      font-size: 0.8rem;
      font-weight: 500;
    }

    .category-chip {
      color: white;
    }

    .tag-chip {
      background: transparent;
      border: 1px solid;
    }

    .photos-section {
      margin-bottom: var(--spacing-xl);
    }

    .photos-section h2 {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
      font-size: 1rem;
      font-weight: 600;
    }

    .photos-section h2 mat-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
      color: #f97316;
    }

    .photos-grid {
      display: flex;
      gap: var(--spacing-md);
      overflow-x: auto;
      padding-bottom: var(--spacing-sm);
    }

    .recipe-photo {
      max-height: 280px;
      border-radius: var(--border-radius-lg);
      object-fit: cover;
      border: 1px solid var(--border-subtle);
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: var(--spacing-xl);
      margin-bottom: var(--spacing-xl);
    }

    @media (max-width: 900px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    .section-card {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-lg);
      padding-bottom: var(--spacing-md);
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

    .servings-adjuster {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .adj-btn {
      width: 32px;
      height: 32px;
      background: rgba(255, 255, 255, 0.05);
    }

    .adj-btn mat-icon {
      font-size: 1rem;
    }

    .servings-display {
      min-width: 2rem;
      text-align: center;
      font-weight: 600;
      font-size: 1.125rem;
    }

    .ingredients-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .ingredients-list li {
      display: flex;
      align-items: baseline;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .ingredients-list li:last-child {
      border-bottom: none;
    }

    .quantity {
      font-weight: 600;
      color: #f97316;
      min-width: 50px;
    }

    .unit {
      color: rgba(255, 255, 255, 0.5);
      min-width: 40px;
    }

    .name {
      flex: 1;
    }

    .notes {
      color: rgba(255, 255, 255, 0.5);
      font-style: italic;
      font-size: 0.875rem;
    }

    .instructions-content {
      line-height: 1.8;
      white-space: pre-wrap;
      color: rgba(255, 255, 255, 0.85);
    }

    .no-instructions {
      color: rgba(255, 255, 255, 0.4);
      font-style: italic;
    }

    .notes-section {
      margin-bottom: var(--spacing-xl);
    }

    .notes-content {
      margin: 0;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.75);
    }

    .source {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.875rem;
    }

    .source mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }

    @media (max-width: 640px) {
      .header {
        flex-direction: column;
      }

      .header-text h1 {
        font-size: 1.5rem;
      }

      .header-actions {
        width: 100%;
      }

      .header-actions button {
        flex: 1;
      }

      .meta-strip {
        flex-wrap: wrap;
      }

      .meta-badge {
        flex: 1;
        min-width: 100px;
        padding: var(--spacing-sm) var(--spacing-md);
      }

      .meta-value {
        font-size: 1.1rem;
      }

      .section-card {
        padding: var(--spacing-md);
      }

      .section-header {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--spacing-sm);
        padding-bottom: var(--spacing-sm);
        margin-bottom: var(--spacing-md);
      }

      .ingredients-list li {
        flex-wrap: wrap;
      }

      .quantity {
        min-width: 40px;
      }

      .unit {
        min-width: 35px;
      }

      .photos-grid {
        gap: var(--spacing-sm);
      }

      .recipe-photo {
        max-height: 200px;
      }
    }

    /* AI Assistant Styles */
    .ai-panel {
      margin-bottom: var(--spacing-xl);
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
    }

    .ai-icon {
      color: #f97316;
      margin-right: var(--spacing-sm);
    }

    .ai-tabs {
      margin-top: var(--spacing-md);
    }

    .ai-tab-content {
      padding: var(--spacing-lg) 0;
      min-height: 200px;
    }

    .load-prompt {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--spacing-xl);
    }

    .load-prompt mat-icon {
      font-size: 3rem;
      width: 3rem;
      height: 3rem;
      color: rgba(255, 255, 255, 0.3);
      margin-bottom: var(--spacing-md);
    }

    .load-prompt p {
      color: rgba(255, 255, 255, 0.6);
      margin: 0 0 var(--spacing-lg);
    }

    .ai-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--spacing-xl);
    }

    .ai-loading p {
      color: rgba(255, 255, 255, 0.5);
      margin: var(--spacing-md) 0 0;
    }

    /* Chat styles */
    .chat-container {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .chat-messages {
      max-height: 300px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      background: rgba(0, 0, 0, 0.2);
      border-radius: var(--border-radius-md);
    }

    .chat-message {
      display: flex;
    }

    .chat-message.user {
      justify-content: flex-end;
    }

    .message-bubble {
      max-width: 80%;
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius-md);
      background: rgba(255, 255, 255, 0.08);
      line-height: 1.5;
    }

    .chat-message.user .message-bubble {
      background: rgba(249, 115, 22, 0.2);
    }

    .chat-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--spacing-lg);
      background: rgba(0, 0, 0, 0.2);
      border-radius: var(--border-radius-md);
    }

    .chat-empty mat-icon {
      font-size: 2.5rem;
      width: 2.5rem;
      height: 2.5rem;
      color: rgba(255, 255, 255, 0.3);
      margin-bottom: var(--spacing-sm);
    }

    .chat-empty p {
      margin: 0;
      color: rgba(255, 255, 255, 0.6);
    }

    .chat-empty .examples {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.4);
      margin-top: var(--spacing-xs);
    }

    .chat-input-row {
      display: flex;
      gap: var(--spacing-sm);
      align-items: flex-start;
    }

    .chat-input {
      flex: 1;
    }

    .send-btn {
      flex-shrink: 0;
    }

    /* Tips styles */
    .tips-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }

    .tips-section h4 {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin: 0 0 var(--spacing-md);
      font-weight: 600;
    }

    .tips-section h4 mat-icon {
      color: #22c55e;
    }

    .tips-section.mistakes h4 mat-icon {
      color: #ef4444;
    }

    .tips-section ul {
      margin: 0;
      padding-left: var(--spacing-lg);
    }

    .tips-section li {
      padding: var(--spacing-xs) 0;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
    }

    /* Flavor profile styles */
    .flavor-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }

    .flavor-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .flavor-chip {
      padding: 6px 16px;
      border-radius: var(--border-radius-full);
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(239, 68, 68, 0.15));
      border: 1px solid rgba(249, 115, 22, 0.3);
      font-size: 0.875rem;
      font-weight: 500;
      color: #fafafa;
    }

    .taste-description {
      line-height: 1.7;
      color: rgba(255, 255, 255, 0.8);
      margin: 0;
    }

    .pairings h4 {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin: 0 0 var(--spacing-md);
      font-weight: 600;
    }

    .pairings h4 mat-icon {
      color: #a855f7;
    }

    .pairings ul {
      margin: 0;
      padding-left: var(--spacing-lg);
    }

    .pairings li {
      padding: var(--spacing-xs) 0;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
    }

    @media (max-width: 640px) {
      .ai-tab-content {
        padding: var(--spacing-md) 0;
      }

      .chat-messages {
        max-height: 250px;
      }

      .message-bubble {
        max-width: 90%;
      }
    }
  `,
})
export class RecipeDetailComponent implements OnInit {
  private readonly api = inject(RecipesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  loading = signal(true);
  recipe = signal<Recipe | null>(null);
  currentServings = signal(4);
  scaledIngredients = signal<Ingredient[]>([]);

  // AI Assistant state
  chatMessages = signal<Message[]>([]);
  chatQuestion = signal('');
  chatLoading = signal(false);
  cookingTips = signal<CookingTipsResponse | null>(null);
  tipsLoading = signal(false);
  flavorProfile = signal<FlavorProfileResponse | null>(null);
  flavorLoading = signal(false);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadRecipe(id);
    }
  }

  loadRecipe(id: string) {
    this.loading.set(true);
    this.api.getRecipe(id).subscribe({
      next: (recipe) => {
        this.recipe.set(recipe);
        this.currentServings.set(recipe.servings);
        this.scaledIngredients.set(recipe.ingredients);
        this.loading.set(false);
      },
      error: () => {
        this.router.navigate(['/recipes']);
      },
    });
  }

  adjustServings(delta: number) {
    const newServings = this.currentServings() + delta;
    if (newServings < 1) return;

    this.currentServings.set(newServings);

    const recipe = this.recipe();
    if (recipe) {
      this.api.getScaledIngredients(recipe.id, newServings).subscribe({
        next: (ingredients) => {
          this.scaledIngredients.set(ingredients);
        },
      });
    }
  }

  formatQuantity(quantity: number): string {
    // Round to reasonable precision
    if (quantity === Math.floor(quantity)) {
      return quantity.toString();
    }
    return quantity.toFixed(2).replace(/\.?0+$/, '');
  }

  formatInstructions(instructions: string): string {
    // Convert newlines to <br> tags
    return instructions.replace(/\n/g, '<br>');
  }

  getPhotoUrl(photoId: string): string {
    return this.api.getPhotoUrl(photoId);
  }

  deleteRecipe() {
    const recipe = this.recipe();
    if (!recipe) return;

    if (confirm(`Are you sure you want to delete "${recipe.title}"?`)) {
      this.api.deleteRecipe(recipe.id).subscribe({
        next: () => {
          this.router.navigate(['/recipes']);
        },
      });
    }
  }

  // AI Assistant methods
  askQuestion() {
    const recipe = this.recipe();
    const question = this.chatQuestion().trim();
    if (!recipe || !question || this.chatLoading()) return;

    // Add user message
    this.chatMessages.update((msgs) => [...msgs, { role: 'user' as const, content: question }]);
    this.chatQuestion.set('');
    this.chatLoading.set(true);

    this.api.chatAboutRecipe(recipe.id, question, this.chatMessages()).subscribe({
      next: (response) => {
        this.chatMessages.update((msgs) => [...msgs, { role: 'assistant' as const, content: response.answer }]);
        this.chatLoading.set(false);
      },
      error: () => {
        this.chatMessages.update((msgs) => [
          ...msgs,
          { role: 'assistant' as const, content: 'Sorry, I had trouble answering that. Please try again.' },
        ]);
        this.chatLoading.set(false);
      },
    });
  }

  loadCookingTips() {
    const recipe = this.recipe();
    if (!recipe || this.tipsLoading()) return;

    this.tipsLoading.set(true);
    this.api.getCookingTips(recipe.id).subscribe({
      next: (tips) => {
        this.cookingTips.set(tips);
        this.tipsLoading.set(false);
      },
      error: () => {
        this.tipsLoading.set(false);
      },
    });
  }

  loadFlavorProfile() {
    const recipe = this.recipe();
    if (!recipe || this.flavorLoading()) return;

    this.flavorLoading.set(true);
    this.api.analyzeFlavorProfile(recipe.id).subscribe({
      next: (profile) => {
        this.flavorProfile.set(profile);
        this.flavorLoading.set(false);
      },
      error: () => {
        this.flavorLoading.set(false);
      },
    });
  }
}
