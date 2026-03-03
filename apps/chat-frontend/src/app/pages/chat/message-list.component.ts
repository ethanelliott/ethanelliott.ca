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
import { MessageBubbleComponent } from './message-bubble.component';
import { SuggestionChipsComponent } from './suggestion-chips.component';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [MessageBubbleComponent, SuggestionChipsComponent, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="message-list-container" #scrollContainer (scroll)="onScroll()">
      @if (messages().length === 0) {
      <div class="empty-state">
        <div class="empty-icon">
          <i class="pi pi-sparkles"></i>
        </div>
        <h2>How can I help you today?</h2>
        <p>Start a conversation by typing a message below.</p>
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
        />
        } @if (statusText()) {
        <div class="status-indicator">
          <i class="pi pi-spin pi-spinner"></i>
          <span>{{ statusText() }}</span>
        </div>
        }
      </div>
      } @if (showScrollButton()) {
      <p-button
        icon="pi pi-arrow-down"
        [rounded]="true"
        severity="secondary"
        size="small"
        class="scroll-to-bottom"
        (click)="scrollToBottom()"
      />
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

    .message-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      scroll-behavior: smooth;
    }

    .messages-wrapper {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
      color: var(--p-text-muted-color);
      padding: 32px;

      .empty-icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;

        i {
          font-size: 1.8rem;
          color: var(--p-primary-color);
        }
      }

      h2 {
        font-size: 1.3rem;
        font-weight: 600;
        color: var(--p-text-color);
        margin: 0 0 8px;
      }

      p {
        font-size: 0.9rem;
        margin: 0;
        max-width: 400px;
      }
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      font-size: 0.8rem;
      color: var(--p-text-muted-color);

      i {
        font-size: 0.85rem;
        color: var(--p-primary-color);
      }
    }

    .scroll-to-bottom {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    @media (max-width: 768px) {
      .message-list-container {
        padding: 12px;
      }
    }
  `,
})
export class MessageListComponent implements AfterViewInit {
  readonly messages = input<DisplayMessage[]>([]);
  readonly isStreaming = input(false);
  readonly statusText = input('');
  readonly suggestionSelected = output<string>();

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

  scrollToBottom(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    this.autoScroll = true;
    this.showScrollButton.set(false);
  }
}
