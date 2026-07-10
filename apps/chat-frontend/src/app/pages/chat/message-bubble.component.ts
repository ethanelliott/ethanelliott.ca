import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  inject,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DisplayMessage } from '../../models/types';
import { MarkdownService } from '../../services/markdown.service';
import { ToolCallChipComponent } from './tool-call-chip.component';

export interface EditMessageEvent {
  messageId: string;
  content: string;
}

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [FormsModule, ToolCallChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message().role === 'user') {
    <!-- ─── User message: right-aligned bubble ─── -->
    <div class="message user-row">
      <div class="user-bubble" [class.editing]="isEditing()">
        @if (message().attachments?.length) {
        <div class="user-attachments">
          @for (att of message().attachments; track att.name) { @if
          (isImageType(att.type)) {
          <div class="attachment-image">
            <img
              [src]="'data:' + att.type + ';base64,' + att.base64"
              [alt]="att.name"
            />
          </div>
          } @else {
          <div class="attachment-file">
            <i class="pi pi-file"></i>
            <span>{{ att.name }}</span>
          </div>
          } }
        </div>
        } @if (isEditing()) {
        <div class="edit-area">
          <textarea
            class="edit-textarea"
            [(ngModel)]="editText"
            rows="3"
            (keydown)="onEditKeydown($event)"
          ></textarea>
          <div class="edit-actions">
            <button class="edit-btn cancel" (click)="cancelEdit()">
              Cancel
            </button>
            <button class="edit-btn save" (click)="saveEdit()">
              <i class="pi pi-send"></i>
              Send
            </button>
          </div>
        </div>
        } @else {
        <div class="message-text">{{ message().content }}</div>
        }
      </div>
      @if (!isEditing()) {
      <div class="user-actions">
        <button
          class="action-btn"
          (click)="copyMessage()"
          [title]="copied() ? 'Copied!' : 'Copy'"
        >
          <i
            class="pi"
            [class.pi-copy]="!copied()"
            [class.pi-check]="copied()"
            [class.copied]="copied()"
          ></i>
        </button>
        @if (canEdit()) {
        <button class="action-btn" (click)="startEdit()" title="Edit & resend">
          <i class="pi pi-pencil"></i>
        </button>
        }
      </div>
      }
    </div>
    } @else {
    <!-- ─── Assistant message: flat block ─── -->
    <div class="message assistant-row">
      <!-- Thinking section -->
      @if (message().thinking) {
      <div
        class="activity-card thinking-section"
        [class.active]="isStreaming() && !message().content"
      >
        <div
          class="activity-header"
          (click)="thinkingExpanded.set(!thinkingExpanded())"
        >
          @if (isStreaming() && !message().content) {
          <i class="pi pi-spin pi-spinner activity-icon thinking"></i>
          <span class="shimmer-text">Thinking…</span>
          } @else {
          <i class="pi pi-lightbulb activity-icon thinking"></i>
          <span>Thought process</span>
          }
          <i
            class="pi expand-chevron"
            [class.pi-chevron-down]="!isThinkingVisible()"
            [class.pi-chevron-up]="isThinkingVisible()"
          ></i>
        </div>
        @if (isThinkingVisible()) {
        <div class="activity-body thinking-content">
          {{ message().thinking }}
        </div>
        }
      </div>
      }

      <!-- Delegations -->
      @if (message().delegations?.length) { @for (delegation of
      message().delegations; track delegation.agentName) {
      <div
        class="activity-card"
        [class.complete]="delegation.status === 'complete'"
      >
        <div
          class="activity-header"
          (click)="toggleDelegation(delegation.agentName)"
        >
          @if (delegation.status === 'pending') {
          <i class="pi pi-spin pi-spinner activity-icon pending"></i>
          } @else {
          <i class="pi pi-check-circle activity-icon complete"></i>
          }
          <span class="delegation-agent">{{ delegation.agentName }}</span>
          @if (delegation.task) {
          <span class="delegation-task">{{ delegation.task }}</span>
          }
          <span class="activity-right">
            @if (delegation.durationMs) {
            <span class="duration">{{
              formatDuration(delegation.durationMs)
            }}</span>
            }
            <i
              class="pi expand-chevron"
              [class.pi-chevron-down]="
                !isDelegationExpanded(delegation.agentName)
              "
              [class.pi-chevron-up]="isDelegationExpanded(delegation.agentName)"
            ></i>
          </span>
        </div>
        @if (isDelegationExpanded(delegation.agentName)) {
        <div class="activity-body">
          @if (delegation.thinking) {
          <div class="delegation-sub-label">Thinking</div>
          <div class="delegation-thinking-content">
            {{ delegation.thinking }}
          </div>
          } @if (delegation.content) {
          <div class="delegation-sub-label">Result</div>
          <div class="delegation-result-content">
            {{ truncate(delegation.content, 1000) }}
          </div>
          }
        </div>
        }
      </div>
      } }

      <!-- Tool calls -->
      @if (message().toolCalls?.length) { @for (tc of message().toolCalls;
      track tc.name + $index) {
      <app-tool-call-chip [toolCall]="tc" />
      } }

      <!-- Main content -->
      @if (message().content) {
      <div
        class="message-text markdown-content"
        [class.streaming]="isStreaming()"
        [innerHTML]="renderedContent()"
      ></div>
      }

      <!-- Footer: actions + stats -->
      @if (message().content && !isStreaming()) {
      <div class="message-footer">
        <div class="message-actions">
          <button
            class="action-btn"
            (click)="copyMessage()"
            [title]="copied() ? 'Copied!' : 'Copy message'"
          >
            <i
              class="pi"
              [class.pi-copy]="!copied()"
              [class.pi-check]="copied()"
              [class.copied]="copied()"
            ></i>
          </button>
          @if (isLast()) {
          <button
            class="action-btn"
            (click)="regenerate.emit()"
            title="Regenerate response"
          >
            <i class="pi pi-refresh"></i>
          </button>
          }
        </div>
        @if (message().stats; as stats) {
        <div class="message-stats">
          @if (stats.model) {
          <span class="stat-item model-chip" title="Model">
            {{ stats.model }}
          </span>
          } @if (stats.tokensPerSecond) {
          <span class="stat-item" title="Tokens per second">
            <i class="pi pi-bolt"></i>{{ formatStat(stats.tokensPerSecond) }}
            tok/s
          </span>
          } @if (stats.completionTokens) {
          <span class="stat-item" title="Completion tokens">
            <i class="pi pi-hashtag"></i>{{ stats.completionTokens }}
          </span>
          } @if (stats.reasoningTokens) {
          <span class="stat-item" title="Reasoning tokens">
            <i class="pi pi-lightbulb"></i>{{ stats.reasoningTokens }}
          </span>
          } @if (stats.timeToFirstTokenMs) {
          <span class="stat-item" title="Time to first token">
            <i class="pi pi-forward"></i
            >{{ formatDuration(stats.timeToFirstTokenMs) }}
          </span>
          } @if (stats.totalDurationMs) {
          <span class="stat-item" title="Total duration">
            <i class="pi pi-stopwatch"></i
            >{{ formatDuration(stats.totalDurationMs) }}
          </span>
          }
        </div>
        }
      </div>
      }
    </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .message {
      padding: 10px 0;
      animation: chat-fade-up 0.25s ease both;
      min-width: 0;
    }

    /* ─── User ─── */
    .user-row {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .user-bubble {
      max-width: 78%;
      padding: 10px 16px;
      border-radius: var(--chat-radius-lg);
      border-bottom-right-radius: 6px;
      background: color-mix(in srgb, var(--p-primary-500) 16%, var(--p-surface-900));
      border: 1px solid color-mix(in srgb, var(--p-primary-500) 25%, transparent);
      color: var(--p-text-color);
      line-height: 1.6;
      font-size: 0.92rem;
      overflow: hidden;

      &.editing {
        width: 78%;
      }
    }

    .user-actions {
      display: flex;
      gap: 2px;
      margin-top: 4px;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .user-row:hover .user-actions {
      opacity: 1;
    }

    .edit-area {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .edit-textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--p-surface-950);
      border: 1px solid var(--p-surface-700);
      border-radius: var(--chat-radius-sm);
      color: var(--p-text-color);
      font-family: inherit;
      font-size: 0.9rem;
      line-height: 1.5;
      padding: 8px 10px;
      resize: vertical;
      outline: none;

      &:focus {
        border-color: var(--chat-accent);
      }
    }

    .edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }

    .edit-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      border-radius: 8px;
      padding: 6px 12px;
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.15s ease;

      i { font-size: 0.7rem; }

      &.cancel {
        background: var(--p-surface-700);
        color: var(--p-text-color);

        &:hover { filter: brightness(1.15); }
      }

      &.save {
        background: var(--chat-gradient);
        color: white;

        &:hover { filter: brightness(1.12); }
      }
    }

    /* ─── Assistant ─── */
    .assistant-row {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .message-text {
      word-break: break-word;
      line-height: 1.65;
      font-size: 0.94rem;
    }

    /* Blinking caret at the end of streaming output */
    :host ::ng-deep .markdown-content.streaming > *:last-child::after {
      content: '▍';
      display: inline-block;
      color: var(--chat-accent);
      animation: chat-caret-blink 1s steps(1) infinite;
      margin-left: 1px;
      font-weight: 400;
    }

    :host ::ng-deep .markdown-content {
      p {
        margin: 0 0 10px;

        &:last-child {
          margin-bottom: 0;
        }
      }

      .code-block-wrapper {
        position: relative;
        background: var(--p-surface-900);
        border: 1px solid var(--p-surface-800);
        border-radius: var(--chat-radius-md);
        margin: 10px 0;
        overflow: hidden;
      }

      .code-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: color-mix(in srgb, var(--p-surface-800) 60%, var(--p-surface-900));
        border-bottom: 1px solid var(--p-surface-800);
        font-size: 0.72rem;
        color: var(--p-text-muted-color);
      }

      .code-lang {
        font-family: var(--chat-font-mono);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .code-copy-btn {
        background: transparent;
        border: none;
        color: var(--p-text-muted-color);
        cursor: pointer;
        padding: 2px 8px;
        font-size: 0.72rem;
        border-radius: 4px;
        transition: color 0.15s ease, background 0.15s ease;

        &:hover {
          color: var(--p-text-color);
          background: var(--p-surface-700);
        }

        &.copied {
          color: #34d399;
        }
      }

      .code-copy-btn-inner {
        display: inline-flex;
        align-items: center;
        gap: 4px;

        svg {
          flex-shrink: 0;
        }
      }

      pre {
        margin: 0;
        padding: 12px 14px;
        overflow-x: auto;
        font-size: 0.83rem;
        background: transparent;
        line-height: 1.6;
      }

      code {
        font-family: var(--chat-font-mono);
        font-size: 0.85em;
      }

      pre code {
        background: transparent;
        padding: 0;
      }

      :not(pre) > code {
        background: color-mix(in srgb, var(--p-primary-500) 12%, var(--p-surface-800));
        border: 1px solid color-mix(in srgb, var(--p-primary-500) 15%, transparent);
        color: var(--p-primary-200);
        padding: 1px 6px;
        border-radius: 5px;
        font-size: 0.82em;
      }

      ul, ol {
        margin: 6px 0;
        padding-left: 22px;
      }

      li {
        margin: 3px 0;
      }

      blockquote {
        border-left: 3px solid var(--chat-accent);
        margin: 10px 0;
        padding: 4px 14px;
        color: var(--p-text-muted-color);
        background: color-mix(in srgb, var(--p-primary-500) 5%, transparent);
        border-radius: 0 8px 8px 0;
      }

      a {
        color: var(--chat-accent);
        text-decoration: none;
        &:hover {
          text-decoration: underline;
        }
      }

      table {
        border-collapse: collapse;
        margin: 10px 0;
        font-size: 0.85rem;
        width: 100%;
      }

      th, td {
        border: 1px solid var(--p-surface-700);
        padding: 6px 10px;
        text-align: left;
      }

      th {
        background: var(--p-surface-800);
        font-weight: 600;
      }

      h1, h2, h3, h4, h5, h6 {
        margin: 14px 0 6px;
        font-weight: 650;
        letter-spacing: -0.01em;
      }

      h1 { font-size: 1.3em; }
      h2 { font-size: 1.15em; }
      h3 { font-size: 1.05em; }

      hr {
        border: none;
        border-top: 1px solid var(--p-surface-700);
        margin: 14px 0;
      }

      img {
        max-width: 100%;
        border-radius: var(--chat-radius-md);
      }
    }

    /* ─── Footer: actions + stats ─── */
    .message-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 8px;
      opacity: 0;
      transition: opacity 0.2s ease;
      min-height: 26px;
    }

    .assistant-row:hover .message-footer {
      opacity: 1;
    }

    .message-actions {
      display: flex;
      gap: 2px;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--p-text-muted-color);
      cursor: pointer;
      padding: 4px 7px;
      border-radius: 7px;
      transition: color 0.15s ease, background 0.15s ease;

      &:hover {
        color: var(--p-text-color);
        background: var(--p-surface-800);
      }

      i {
        font-size: 0.8rem;

        &.copied {
          color: #34d399;
        }
      }
    }

    .message-stats {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      font-family: var(--chat-font-mono);
      font-size: 0.66rem;
      color: var(--p-text-muted-color);
    }

    .stat-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;

      i {
        font-size: 0.6rem;
        opacity: 0.7;
      }
    }

    .model-chip {
      border: 1px solid var(--p-surface-700);
      border-radius: 999px;
      padding: 1px 8px;
      color: var(--p-primary-300);
    }

    /* ─── Activity cards (thinking / delegations) ─── */
    .activity-card {
      border: 1px solid var(--p-surface-800);
      border-radius: var(--chat-radius-md);
      margin-bottom: 8px;
      overflow: hidden;
      background: color-mix(in srgb, var(--p-surface-900) 65%, transparent);
      font-size: 0.8rem;
      transition: border-color 0.3s ease;

      &.active {
        border-color: color-mix(in srgb, var(--p-primary-500) 40%, transparent);
      }
    }

    .activity-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--p-text-muted-color);
      transition: background 0.15s ease;

      &:hover {
        background: var(--p-surface-800);
      }
    }

    .activity-icon {
      font-size: 0.82rem;

      &.thinking { color: #fbbf24; }
      &.pending { color: var(--chat-accent); }
      &.complete { color: #34d399; }
    }

    .activity-right {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      color: var(--p-text-muted-color);
      font-size: 0.72rem;
    }

    .expand-chevron {
      font-size: 0.65rem;
      margin-left: auto;

      .activity-right & {
        margin-left: 0;
      }
    }

    .activity-body {
      padding: 10px 12px;
      border-top: 1px solid var(--p-surface-800);
    }

    .thinking-content {
      font-size: 0.78rem;
      line-height: 1.55;
      color: var(--p-text-muted-color);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px;
      overflow-y: auto;
    }

    .delegation-agent {
      font-family: var(--chat-font-mono);
      font-weight: 600;
      font-size: 0.74rem;
      color: var(--p-text-color);
    }

    .delegation-task {
      color: var(--p-text-muted-color);
      font-size: 0.74rem;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .duration {
      font-family: var(--chat-font-mono);
      font-size: 0.68rem;
    }

    .delegation-sub-label {
      font-size: 0.66rem;
      font-weight: 700;
      color: var(--p-text-muted-color);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;

      &:not(:first-child) {
        margin-top: 10px;
      }
    }

    .delegation-thinking-content,
    .delegation-result-content {
      font-size: 0.78rem;
      line-height: 1.55;
      color: var(--p-text-muted-color);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
    }

    .delegation-result-content {
      color: var(--p-text-color);
    }

    /* ─── User attachments ─── */
    .user-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }

    .attachment-image {
      border-radius: var(--chat-radius-sm);
      overflow: hidden;
      max-width: 200px;

      img {
        display: block;
        width: 100%;
        height: auto;
        max-height: 180px;
        object-fit: cover;
      }
    }

    .attachment-file {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
      opacity: 0.85;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 3px 8px;

      i {
        font-size: 0.7rem;
      }
    }

    @media (max-width: 768px) {
      .user-bubble {
        max-width: 88%;
      }

      /* Touch devices have no hover — keep footers visible */
      .message-footer,
      .user-actions {
        opacity: 1;
      }
    }
  `,
})
export class MessageBubbleComponent {
  readonly message = input.required<DisplayMessage>();
  readonly isStreaming = input(false);
  readonly isLast = input(false);
  readonly canEdit = input(false);
  readonly regenerate = output<void>();
  readonly editSubmit = output<EditMessageEvent>();

  private readonly markdown = inject(MarkdownService);

  thinkingExpanded = signal(false);
  readonly copied = signal(false);
  readonly isEditing = signal(false);
  editText = '';
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;
  private expandedDelegations = signal<Set<string>>(new Set());

  readonly isThinkingVisible = computed(() => {
    const msg = this.message();
    // Auto-expand while streaming thinking (before content arrives)
    if (this.isStreaming() && msg.thinking && !msg.content) return true;
    return this.thinkingExpanded();
  });

  readonly renderedContent = computed(() => {
    const msg = this.message();
    if (msg.role === 'user') return msg.content;
    // Use streaming-tolerant render during streaming, cached otherwise
    if (this.isStreaming()) {
      return this.markdown.renderStreaming(msg.content);
    }
    if (msg.renderedHtml) return msg.renderedHtml;
    return this.markdown.render(msg.content);
  });

  copyMessage(): void {
    const content = this.message().content;
    if (!content || !navigator.clipboard) return;
    navigator.clipboard.writeText(content).then(() => {
      this.copied.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    });
  }

  startEdit(): void {
    this.editText = this.message().content;
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
  }

  saveEdit(): void {
    const text = this.editText.trim();
    if (!text) return;
    this.isEditing.set(false);
    this.editSubmit.emit({ messageId: this.message().id, content: text });
  }

  onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.saveEdit();
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.cancelEdit();
    }
  }

  toggleDelegation(agentName: string): void {
    this.expandedDelegations.update((set) => {
      const next = new Set(set);
      if (next.has(agentName)) {
        next.delete(agentName);
      } else {
        next.add(agentName);
      }
      return next;
    });
  }

  isDelegationExpanded(agentName: string): boolean {
    return this.expandedDelegations().has(agentName);
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  formatStat(value: number | undefined): string {
    if (value === undefined || value === null) return '';
    return value.toFixed(1);
  }

  truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '... (truncated)';
  }

  isImageType(type: string): boolean {
    return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(
      type
    );
  }
}
