import {
  ChangeDetectionStrategy,
  Component,
  input,
  inject,
  computed,
} from '@angular/core';
import { DisplayMessage } from '../../models/types';
import { MarkdownService } from '../../services/markdown.service';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [],
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
        <div class="message-text">{{ message().content }}</div>
        } @else {
        <div
          class="message-text markdown-content"
          [innerHTML]="renderedContent()"
        ></div>
        }
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
      max-width: 75%;
      padding: 10px 14px;
      border-radius: 16px;
      line-height: 1.55;
      font-size: 0.9rem;
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

      pre {
        background: var(--p-surface-900);
        border: 1px solid var(--p-surface-600);
        border-radius: 8px;
        padding: 12px;
        overflow-x: auto;
        margin: 8px 0;
        font-size: 0.85rem;
      }

      code {
        font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        font-size: 0.85em;
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
      .bubble {
        max-width: 88%;
      }

      .avatar {
        width: 28px;
        height: 28px;
        font-size: 0.75rem;
      }
    }
  `,
})
export class MessageBubbleComponent {
  readonly message = input.required<DisplayMessage>();
  readonly isStreaming = input(false);

  private readonly markdown = inject(MarkdownService);

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
}
