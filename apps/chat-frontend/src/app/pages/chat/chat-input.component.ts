import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
  input,
  ElementRef,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [FormsModule, TextareaModule, ButtonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-input-container">
      <div class="input-row">
        <textarea
          pTextarea
          [(ngModel)]="messageText"
          [autoResize]="true"
          [rows]="1"
          placeholder="Send a message..."
          class="chat-textarea"
          (keydown)="onKeydown($event)"
          #textareaEl
        ></textarea>
        @if (isStreaming()) {
        <p-button
          icon="pi pi-stop"
          [rounded]="true"
          severity="danger"
          pTooltip="Stop generating"
          (click)="stopGeneration.emit()"
        />
        } @else {
        <p-button
          icon="pi pi-send"
          [rounded]="true"
          [disabled]="!messageText.trim()"
          pTooltip="Send message"
          (click)="send()"
        />
        }
      </div>
    </div>
  `,
  styles: `
    .chat-input-container {
      padding: 12px 16px 16px;
      background: var(--p-surface-950);
      border-top: 1px solid var(--p-surface-700);
    }

    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      max-width: 800px;
      margin: 0 auto;
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-600);
      border-radius: 16px;
      padding: 8px 8px 8px 16px;
      transition: border-color 0.2s ease;

      &:focus-within {
        border-color: var(--p-primary-color);
      }
    }

    .chat-textarea {
      flex: 1;
      border: none !important;
      background: transparent !important;
      resize: none;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--p-text-color);
      padding: 4px 0;
      max-height: 200px;
      box-shadow: none !important;
      outline: none !important;

      &::placeholder {
        color: var(--p-text-muted-color);
      }
    }

    :host ::ng-deep {
      .p-textarea {
        border: none;
        background: transparent;
        box-shadow: none;
        padding: 4px 0;

        &:focus {
          border: none;
          box-shadow: none;
        }
      }
    }

    @media (max-width: 768px) {
      .chat-input-container {
        padding: 8px 12px 12px;
      }

      .input-row {
        border-radius: 12px;
        padding: 6px 6px 6px 12px;
      }
    }
  `,
})
export class ChatInputComponent {
  readonly isStreaming = input(false);
  readonly sendMessage = output<string>();
  readonly stopGeneration = output<void>();

  messageText = '';
  private readonly textareaEl =
    viewChild<ElementRef<HTMLTextAreaElement>>('textareaEl');

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const text = this.messageText.trim();
    if (!text) return;
    this.sendMessage.emit(text);
    this.messageText = '';
    // Reset textarea height
    const el = this.textareaEl()?.nativeElement;
    if (el) {
      el.style.height = 'auto';
    }
  }

  focus(): void {
    this.textareaEl()?.nativeElement?.focus();
  }
}
