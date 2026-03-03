import {
  ChangeDetectionStrategy,
  Component,
  input,
  inject,
  computed,
  signal,
} from '@angular/core';
import { DisplayMessage } from '../../models/types';
import { MarkdownService } from '../../services/markdown.service';
import { ToolCallChipComponent } from './tool-call-chip.component';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [ToolCallChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="message"
      [class.user]="message().role === 'user'"
      [class.assistant]="message().role === 'assistant'"
    >
      @if (message().role === 'assistant') {
      <div class="avatar assistant-avatar">
        <i class="pi pi-sparkles"></i>
      </div>
      }
      <div
        class="bubble"
        [class.user-bubble]="message().role === 'user'"
        [class.assistant-bubble]="message().role === 'assistant'"
      >
        @if (message().role === 'user') {
        <!-- User attachments -->
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
        }
        <div class="message-text">{{ message().content }}</div>
        } @else {
        <!-- Thinking section -->
        @if (message().thinking) {
        <div
          class="thinking-section"
          [class.active]="isStreaming() && !message().content"
        >
          <div
            class="thinking-header"
            (click)="thinkingExpanded.set(!thinkingExpanded())"
          >
            @if (isStreaming() && !message().content) {
            <i class="pi pi-spin pi-spinner thinking-icon"></i>
            } @else {
            <i class="pi pi-lightbulb thinking-icon"></i>
            }
            <span>Thinking</span>
            <i
              class="pi"
              [class.pi-chevron-down]="!isThinkingVisible()"
              [class.pi-chevron-up]="isThinkingVisible()"
            ></i>
          </div>
          @if (isThinkingVisible()) {
          <div class="thinking-content">{{ message().thinking }}</div>
          }
        </div>
        }

        <!-- Delegations -->
        @if (message().delegations?.length) { @for (delegation of
        message().delegations; track delegation.agentName) {
        <div
          class="delegation-chip"
          [class.complete]="delegation.status === 'complete'"
        >
          <div
            class="delegation-header"
            (click)="toggleDelegation(delegation.agentName)"
          >
            <div class="delegation-left">
              @if (delegation.status === 'pending') {
              <i class="pi pi-spin pi-spinner delegation-icon"></i>
              } @else {
              <i class="pi pi-check-circle delegation-icon complete"></i>
              }
              <span class="delegation-agent">{{ delegation.agentName }}</span>
              @if (delegation.task) {
              <span class="delegation-task">{{ delegation.task }}</span>
              }
            </div>
            <div class="delegation-right">
              @if (delegation.durationMs) {
              <span class="delegation-duration">{{
                formatDuration(delegation.durationMs)
              }}</span>
              }
              <i
                class="pi"
                [class.pi-chevron-down]="
                  !isDelegationExpanded(delegation.agentName)
                "
                [class.pi-chevron-up]="
                  isDelegationExpanded(delegation.agentName)
                "
              ></i>
            </div>
          </div>
          @if (isDelegationExpanded(delegation.agentName)) {
          <div class="delegation-body">
            @if (delegation.thinking) {
            <div class="delegation-thinking">
              <div class="delegation-sub-label">Thinking</div>
              <div class="delegation-thinking-content">
                {{ delegation.thinking }}
              </div>
            </div>
            } @if (delegation.content) {
            <div class="delegation-result">
              <div class="delegation-sub-label">Result</div>
              <div class="delegation-result-content">
                {{ truncate(delegation.content, 1000) }}
              </div>
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
          [innerHTML]="renderedContent()"
        ></div>
        } }
      </div>
      @if (message().role === 'user') {
      <div class="avatar user-avatar">
        <i class="pi pi-user"></i>
      </div>
      }
    </div>
  `,
  styles: `
    .message {
      display: flex;
      gap: 10px;
      padding: 8px 0;
      align-items: flex-start;
      min-width: 0;

      &.user {
        justify-content: flex-end;
      }

      &.assistant {
        justify-content: flex-start;
      }
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 0.85rem;
    }

    .assistant-avatar {
      background: color-mix(in srgb, var(--p-primary-color) 20%, transparent);
      color: var(--p-primary-color);
    }

    .user-avatar {
      background: var(--p-surface-700);
      color: var(--p-text-muted-color);
    }

    .bubble {
      padding: 10px 14px;
      border-radius: 16px;
      line-height: 1.55;
      font-size: 0.9rem;
      min-width: 0;
      overflow: hidden;
    }

    .user-bubble {
      max-width: 75%;
    }

    .user-bubble {
      background: var(--p-primary-color);
      color: var(--p-primary-contrast-color);
      border-bottom-right-radius: 4px;
    }

    .assistant-bubble {
      background: var(--p-surface-800);
      color: var(--p-text-color);
      border-bottom-left-radius: 4px;
    }

    .message-text {
      word-break: break-word;
    }

    :host ::ng-deep .markdown-content {
      p {
        margin: 0 0 8px;

        &:last-child {
          margin-bottom: 0;
        }
      }

      .code-block-wrapper {
        position: relative;
        background: var(--p-surface-900);
        border: 1px solid var(--p-surface-600);
        border-radius: 8px;
        margin: 8px 0;
        overflow: hidden;
      }

      .code-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: var(--p-surface-800);
        border-bottom: 1px solid var(--p-surface-600);
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
      }

      .code-lang {
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
        font-size: 0.75rem;
        border-radius: 4px;
        transition: color 0.15s ease, background 0.15s ease;

        &:hover {
          color: var(--p-text-color);
          background: var(--p-surface-700);
        }

        &.copied {
          color: #22c55e;
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
        padding: 12px;
        overflow-x: auto;
        font-size: 0.85rem;
        background: transparent;
      }

      code {
        font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        font-size: 0.85em;
      }

      pre code {
        background: transparent;
        padding: 0;
      }

      :not(pre) > code {
        background: var(--p-surface-700);
        padding: 2px 6px;
        border-radius: 4px;
      }

      ul, ol {
        margin: 4px 0;
        padding-left: 20px;
      }

      li {
        margin: 2px 0;
      }

      blockquote {
        border-left: 3px solid var(--p-primary-color);
        margin: 8px 0;
        padding: 4px 12px;
        color: var(--p-text-muted-color);
      }

      a {
        color: var(--p-primary-color);
        text-decoration: none;
        &:hover {
          text-decoration: underline;
        }
      }

      table {
        border-collapse: collapse;
        margin: 8px 0;
        font-size: 0.85rem;
        width: 100%;
      }

      th, td {
        border: 1px solid var(--p-surface-600);
        padding: 6px 10px;
        text-align: left;
      }

      th {
        background: var(--p-surface-700);
        font-weight: 600;
      }

      h1, h2, h3, h4, h5, h6 {
        margin: 12px 0 6px;
        font-weight: 600;
      }

      h1 { font-size: 1.3em; }
      h2 { font-size: 1.15em; }
      h3 { font-size: 1.05em; }

      hr {
        border: none;
        border-top: 1px solid var(--p-surface-600);
        margin: 12px 0;
      }

      img {
        max-width: 100%;
        border-radius: 8px;
      }
    }

    @media (max-width: 768px) {
      .user-bubble {
        max-width: 88%;
      }

      .avatar {
        width: 28px;
        height: 28px;
        font-size: 0.75rem;
      }
    }

    /* Thinking section */
    .thinking-section {
      border: 1px solid var(--p-surface-600);
      border-radius: 8px;
      margin-bottom: 8px;
      overflow: hidden;
      background: var(--p-surface-900);
      transition: border-color 0.3s ease;

      &.active {
        border-color: #f59e0b55;
      }
    }

    .thinking-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--p-text-muted-color);
      transition: background 0.15s ease;

      &:hover {
        background: var(--p-surface-800);
      }

      .thinking-icon {
        font-size: 0.85rem;
      }

      .pi-lightbulb {
        color: #f59e0b;
      }

      .pi-spinner {
        color: #f59e0b;
      }

      .pi-chevron-down, .pi-chevron-up {
        margin-left: auto;
        font-size: 0.7rem;
      }
    }

    .thinking-content {
      padding: 8px 10px;
      border-top: 1px solid var(--p-surface-600);
      font-size: 0.78rem;
      line-height: 1.5;
      color: var(--p-text-muted-color);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px;
      overflow-y: auto;
    }

    /* Delegation chips */
    .delegation-chip {
      border: 1px solid var(--p-surface-600);
      border-radius: 8px;
      margin: 6px 0;
      overflow: hidden;
      background: var(--p-surface-900);
      font-size: 0.8rem;
    }

    .delegation-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: var(--p-surface-800);
      }
    }

    .delegation-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .delegation-right {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--p-text-muted-color);
      font-size: 0.75rem;

      i { font-size: 0.7rem; }
    }

    .delegation-icon {
      font-size: 0.85rem;
      color: var(--p-primary-color);

      &.complete { color: #22c55e; }
    }

    .delegation-agent {
      font-weight: 600;
      color: var(--p-text-color);
    }

    .delegation-task {
      color: var(--p-text-muted-color);
      font-size: 0.75rem;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .delegation-duration {
      color: var(--p-text-muted-color);
    }

    .delegation-body {
      border-top: 1px solid var(--p-surface-600);
      padding: 8px 10px;
    }

    .delegation-sub-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--p-text-muted-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .delegation-thinking-content,
    .delegation-result-content {
      font-size: 0.78rem;
      line-height: 1.5;
      color: var(--p-text-muted-color);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
      margin-bottom: 8px;

      &:last-child { margin-bottom: 0; }
    }

    .delegation-result-content {
      color: var(--p-text-color);
    }

    /* User attachments */
    .user-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }

    .attachment-image {
      border-radius: 8px;
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
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 3px 8px;

      i {
        font-size: 0.7rem;
      }
    }
  `,
})
export class MessageBubbleComponent {
  readonly message = input.required<DisplayMessage>();
  readonly isStreaming = input(false);

  private readonly markdown = inject(MarkdownService);

  thinkingExpanded = signal(false);
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
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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
