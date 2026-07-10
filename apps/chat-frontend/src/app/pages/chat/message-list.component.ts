import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  viewChild,
  ElementRef,
  effect,
  AfterViewInit,
} from '@angular/core';
import { DisplayMessage } from '../../models/types';
import {
  MessageBubbleComponent,
  EditMessageEvent,
} from './message-bubble.component';
import { SuggestionChipsComponent } from './suggestion-chips.component';

export interface LiveGenerationStats {
  tokens: number;
  tokensPerSecond: number;
  elapsedMs: number;
}

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [MessageBubbleComponent, SuggestionChipsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="message-list-container" #scrollContainer (scroll)="onScroll()">
      @if (messages().length === 0) {
      <div class="empty-state">
        <div class="empty-mark">
          <i class="pi pi-sparkles"></i>
        </div>
        <h1 class="greeting">{{ greeting }}</h1>
        <p class="greeting-sub">
          Your models, your machine. What are we doing today?
        </p>
        <app-suggestion-chips
          (selectSuggestion)="suggestionSelected.emit($event)"
        />
      </div>
      } @else {
      <div class="messages-wrapper">
        @for (msg of messages(); track msg.id; let last = $last) {
        <app-message-bubble
          [message]="msg"
          [isStreaming]="last && isStreaming()"
          [isLast]="last"
          [canEdit]="!isStreaming()"
          (regenerate)="regenerateRequested.emit()"
          (editSubmit)="editSubmitted.emit($event)"
        />
        } @if (isStreaming() || statusText()) {
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span class="shimmer-text">{{ statusText() || 'Generating…' }}</span>
          @if (liveStats(); as stats) { @if (stats.tokens > 0) {
          <span class="live-stats">
            <span class="live-stat"
              >{{ stats.tokensPerSecond.toFixed(1) }} tok/s</span
            >
            <span class="live-stat">{{ stats.tokens }} tokens</span>
            <span class="live-stat">{{ formatElapsed(stats.elapsedMs) }}</span>
          </span>
          } }
        </div>
        }
      </div>
      } @if (showScrollButton()) {
      <button class="scroll-to-bottom" (click)="scrollToBottom('smooth')">
        <i class="pi pi-arrow-down"></i>
        <span>Latest</span>
      </button>
      }
    </div>
  `,
  styles: `
    :host {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    /* No CSS smooth scrolling: per-token scrollTop updates during streaming
       fight the animation and cause jank. Smooth behaviour is applied
       programmatically only for the scroll-to-bottom button. */
    .message-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px 16px 8px;
    }

    .messages-wrapper {
      display: flex;
      flex-direction: column;
      max-width: var(--chat-content-width);
      margin: 0 auto;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      text-align: center;
      color: var(--p-text-muted-color);
      padding: 32px;
      animation: chat-fade-up 0.35s ease both;

      .empty-mark {
        width: 56px;
        height: 56px;
        border-radius: 18px;
        background: var(--chat-gradient);
        box-shadow: var(--chat-glow);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;

        i {
          font-size: 1.5rem;
          color: white;
        }
      }

      .greeting {
        font-size: 1.8rem;
        font-weight: 750;
        letter-spacing: -0.03em;
        margin: 0 0 6px;
        background: var(--chat-gradient);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .greeting-sub {
        font-size: 0.92rem;
        margin: 0;
        max-width: 420px;
      }
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--chat-gradient);
      animation: chat-pulse-dot 1.2s ease-in-out infinite;
      flex-shrink: 0;
    }

    .live-stats {
      display: inline-flex;
      gap: 8px;
      margin-left: auto;
    }

    .live-stat {
      font-family: var(--chat-font-mono);
      font-size: 0.66rem;
      color: var(--p-text-muted-color);
      border: 1px solid var(--p-surface-800);
      border-radius: 999px;
      padding: 2px 8px;
      white-space: nowrap;
    }

    .scroll-to-bottom {
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--p-surface-700);
      border-radius: 999px;
      background: color-mix(in srgb, var(--p-surface-900) 90%, transparent);
      backdrop-filter: blur(8px);
      color: var(--p-text-color);
      font-family: inherit;
      font-size: 0.75rem;
      font-weight: 500;
      padding: 6px 14px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      transition: border-color 0.15s ease, transform 0.1s ease;

      i { font-size: 0.7rem; }

      &:hover {
        border-color: var(--chat-accent);
      }

      &:active {
        transform: translateX(-50%) scale(0.96);
      }
    }

    @media (max-width: 768px) {
      .message-list-container {
        padding: 12px;
      }

      .empty-state .greeting {
        font-size: 1.4rem;
      }
    }
  `,
})
export class MessageListComponent implements AfterViewInit {
  readonly messages = input<DisplayMessage[]>([]);
  readonly isStreaming = input(false);
  readonly statusText = input('');
  readonly liveStats = input<LiveGenerationStats | null>(null);
  readonly suggestionSelected = output<string>();
  readonly regenerateRequested = output<void>();
  readonly editSubmitted = output<EditMessageEvent>();

  readonly greeting = this.computeGreeting();

  showScrollButton = signal(false);
  private readonly scrollContainer =
    viewChild<ElementRef<HTMLDivElement>>('scrollContainer');
  private autoScroll = true;

  constructor() {
    // Auto-scroll when messages change during streaming
    effect(() => {
      const msgs = this.messages();
      const streaming = this.isStreaming();
      if (msgs.length > 0 && this.autoScroll) {
        // Use setTimeout to let the DOM update
        setTimeout(() => this.scrollToBottom(), 0);
      }
      // Also scroll on status text changes
      if (streaming && this.autoScroll) {
        setTimeout(() => this.scrollToBottom(), 0);
      }
    });
  }

  ngAfterViewInit(): void {
    this.scrollToBottom();
  }

  onScroll(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    const threshold = 100;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    this.autoScroll = isNearBottom;
    this.showScrollButton.set(!isNearBottom && this.messages().length > 0);
  }

  scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    this.autoScroll = true;
    this.showScrollButton.set(false);
  }

  formatElapsed(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private computeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 5) return 'Burning the midnight oil?';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }
}
