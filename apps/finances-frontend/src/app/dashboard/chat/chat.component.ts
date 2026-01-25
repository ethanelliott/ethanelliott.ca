import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  signal,
  viewChild,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import {
  ChatService,
  ChatMessage,
  ToolResult,
} from '../../services/chat.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatCardModule,
  ],
  template: `
    <div class="chat-container">
      <div class="chat-header">
        <div class="header-info">
          <mat-icon class="header-icon">smart_toy</mat-icon>
          <div class="header-text">
            <h2>Financial Assistant</h2>
            <p>Ask questions about your finances</p>
          </div>
        </div>
        <button
          mat-icon-button
          (click)="clearChat()"
          matTooltip="Clear conversation"
          [disabled]="messages().length === 0 || isLoading()"
        >
          <mat-icon>delete_outline</mat-icon>
        </button>
      </div>

      <div class="messages-container" #messagesContainer>
        @if (messages().length === 0) {
        <div class="empty-state">
          <mat-icon>chat_bubble_outline</mat-icon>
          <h3>Start a conversation</h3>
          <p>Ask me anything about your financial data</p>
          <div class="suggestions">
            <button
              mat-stroked-button
              (click)="sendSuggestion('What is my current net worth?')"
            >
              What is my net worth?
            </button>
            <button
              mat-stroked-button
              (click)="sendSuggestion('How much did I spend this month?')"
            >
              Monthly spending
            </button>
            <button
              mat-stroked-button
              (click)="sendSuggestion('Show me my spending trends')"
            >
              Spending trends
            </button>
            <button
              mat-stroked-button
              (click)="
                sendSuggestion('What are my biggest expense categories?')
              "
            >
              Top categories
            </button>
          </div>
        </div>
        } @else { @for (message of messages(); track $index) {
        <div
          class="message"
          [class.user]="message.role === 'user'"
          [class.assistant]="message.role === 'assistant'"
        >
          <div class="message-avatar">
            @if (message.role === 'user') {
            <mat-icon>person</mat-icon>
            } @else {
            <mat-icon>smart_toy</mat-icon>
            }
          </div>
          <div class="message-content">
            @if (message.toolResults && message.toolResults.length > 0) {
            <div class="tool-results">
              @for (tool of message.toolResults; track tool.name) {
              <div class="tool-chip">
                <mat-icon>build</mat-icon>
                <span>{{ formatToolName(tool.name) }}</span>
              </div>
              }
            </div>
            }
            <div
              class="message-text"
              [innerHTML]="formatMessage(message.content)"
            ></div>
            <span class="message-time">{{
              message.timestamp | date : 'shortTime'
            }}</span>
          </div>
        </div>
        } @if (isLoading()) {
        <div class="message assistant loading">
          <div class="message-avatar">
            <mat-icon>smart_toy</mat-icon>
          </div>
          <div class="message-content">
            @if (pendingToolResults().length > 0) {
            <div class="tool-results">
              @for (tool of pendingToolResults(); track tool.name) {
              <div class="tool-chip processing">
                <mat-icon>sync</mat-icon>
                <span>{{ formatToolName(tool.name) }}</span>
              </div>
              }
            </div>
            }
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
        } }
      </div>

      <div class="input-container">
        <mat-form-field appearance="outline" class="message-input">
          <input
            matInput
            #messageInput
            [(ngModel)]="inputMessage"
            (keyup.enter)="sendMessage()"
            placeholder="Ask about your finances..."
            [disabled]="isLoading()"
          />
        </mat-form-field>
        <button
          mat-fab
          color="primary"
          (click)="sendMessage()"
          [disabled]="!inputMessage().trim() || isLoading()"
          class="send-button"
        >
          @if (isLoading()) {
          <mat-spinner diameter="24"></mat-spinner>
          } @else {
          <mat-icon>send</mat-icon>
          }
        </button>
      </div>
    </div>
  `,
  styles: `
    @import 'styles/variables';

    .chat-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 56px - 2 * var(--spacing-xl));
      max-width: 800px;
      margin: 0 auto;
      background: var(--bg-card);
      border-radius: var(--border-radius-xl);
      border: 1px solid var(--border-subtle);
      overflow: hidden;
    }

    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-lg);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-subtle);
    }

    .header-info {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .header-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: var(--mat-sys-primary);
    }

    .header-text h2 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .header-text p {
      margin: 0;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      opacity: 0.5;
      margin-bottom: var(--spacing-md);
    }

    .empty-state h3 {
      margin: 0 0 var(--spacing-sm);
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .empty-state p {
      margin: 0 0 var(--spacing-xl);
      font-size: 0.9rem;
    }

    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      justify-content: center;
      max-width: 500px;
    }

    .suggestions button {
      font-size: 0.85rem;
    }

    .message {
      display: flex;
      gap: var(--spacing-md);
      max-width: 85%;
    }

    .message.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .message-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
    }

    .message.user .message-avatar {
      background: var(--mat-sys-primary);
      border-color: var(--mat-sys-primary);
    }

    .message.user .message-avatar mat-icon {
      color: var(--mat-sys-on-primary);
    }

    .message-avatar mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--mat-sys-on-surface-variant);
    }

    .message-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .message-text {
      padding: var(--spacing-md);
      border-radius: var(--border-radius-lg);
      background: var(--bg-subtle);
      color: var(--mat-sys-on-surface);
      line-height: 1.5;
      font-size: 0.95rem;
      white-space: pre-wrap;
    }

    .message.user .message-text {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }

    .message-time {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      padding: 0 var(--spacing-sm);
    }

    .message.user .message-time {
      text-align: right;
    }

    .tool-results {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs);
      margin-bottom: var(--spacing-xs);
    }

    .tool-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgba(var(--mat-sys-primary-rgb), 0.15);
      color: var(--mat-sys-primary);
      font-size: 0.8rem;
      font-weight: 500;
    }

    .tool-chip mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .tool-chip.processing mat-icon {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: var(--spacing-md);
      background: var(--bg-subtle);
      border-radius: var(--border-radius-lg);
      width: fit-content;
    }

    .typing-indicator span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mat-sys-on-surface-variant);
      animation: bounce 1.4s infinite ease-in-out both;
    }

    .typing-indicator span:nth-child(1) {
      animation-delay: -0.32s;
    }

    .typing-indicator span:nth-child(2) {
      animation-delay: -0.16s;
    }

    @keyframes bounce {
      0%,
      80%,
      100% {
        transform: scale(0);
      }
      40% {
        transform: scale(1);
      }
    }

    .input-container {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-lg);
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-subtle);
    }

    .message-input {
      flex: 1;
    }

    .message-input ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .send-button {
      flex-shrink: 0;
    }

    @media (max-width: 768px) {
      .chat-container {
        height: calc(100vh - 56px - 2 * var(--spacing-md));
        border-radius: var(--border-radius-lg);
      }

      .message {
        max-width: 90%;
      }

      .suggestions {
        flex-direction: column;
      }

      .suggestions button {
        width: 100%;
      }
    }
  `,
})
export class ChatComponent implements OnInit, AfterViewChecked {
  private readonly chatService = inject(ChatService);

  readonly messagesContainer =
    viewChild.required<ElementRef>('messagesContainer');

  messages = signal<ChatMessage[]>([]);
  inputMessage = signal('');
  isLoading = signal(false);
  pendingToolResults = signal<ToolResult[]>([]);

  private shouldScrollToBottom = false;

  ngOnInit(): void {
    // Restore any existing conversation history
    const history = this.chatService.getHistory();
    if (history.length > 0) {
      // Convert history to ChatMessage format
      const restoredMessages: ChatMessage[] = history
        .filter((h) => h.role === 'user' || h.role === 'assistant')
        .map((h) => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
          timestamp: new Date(),
        }));
      this.messages.set(restoredMessages);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  sendMessage(): void {
    const message = this.inputMessage().trim();
    if (!message || this.isLoading()) return;

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    this.messages.update((msgs) => [...msgs, userMessage]);
    this.inputMessage.set('');
    this.isLoading.set(true);
    this.pendingToolResults.set([]);
    this.shouldScrollToBottom = true;

    // Send to chat service
    this.chatService.sendMessage(message).subscribe({
      next: (response) => {
        if (response.toolResults.length > 0) {
          this.pendingToolResults.set(response.toolResults);
          this.shouldScrollToBottom = true;
        }

        if (response.done) {
          // Create assistant message with any tool results
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: response.content,
            timestamp: new Date(),
            toolResults:
              this.pendingToolResults().length > 0
                ? this.pendingToolResults()
                : undefined,
          };
          this.messages.update((msgs) => [...msgs, assistantMessage]);
          this.pendingToolResults.set([]);
          this.isLoading.set(false);
          this.shouldScrollToBottom = true;
        }
      },
      error: (err) => {
        console.error('Chat error:', err);
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          timestamp: new Date(),
        };
        this.messages.update((msgs) => [...msgs, errorMessage]);
        this.pendingToolResults.set([]);
        this.isLoading.set(false);
        this.shouldScrollToBottom = true;
      },
    });
  }

  sendSuggestion(suggestion: string): void {
    this.inputMessage.set(suggestion);
    this.sendMessage();
  }

  clearChat(): void {
    this.messages.set([]);
    this.chatService.clearHistory();
  }

  formatToolName(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  formatMessage(content: string): string {
    if (!content) return '';

    // Escape HTML first
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Format bold text **text**
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Format bullet points
    formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Format line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  private scrollToBottom(): void {
    try {
      const container = this.messagesContainer()?.nativeElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    } catch (err) {
      // Ignore scroll errors
    }
  }
}
