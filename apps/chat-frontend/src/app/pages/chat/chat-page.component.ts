import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  OnDestroy,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ConversationService } from '../../services/conversation.service';
import { ChatApiService } from '../../services/chat-api.service';
import { MarkdownService } from '../../services/markdown.service';
import { SettingsService } from '../../services/settings.service';
import {
  ChatMessage,
  DisplayMessage,
  StreamEvent,
  DisplayToolCall,
} from '../../models/types';
import { MessageListComponent } from './message-list.component';
import { ChatInputComponent } from './chat-input.component';
import { ModelSelectorComponent } from './model-selector.component';
import {
  ApprovalDialogComponent,
  ApprovalRequest,
  ApprovalResponse,
} from './approval-dialog.component';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [
    MessageListComponent,
    ChatInputComponent,
    ModelSelectorComponent,
    ApprovalDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-page">
      <div class="chat-header">
        <app-model-selector />
      </div>
      <app-message-list
        [messages]="displayMessages()"
        [isStreaming]="conversationService.isStreaming()"
        [statusText]="statusText()"
        (suggestionSelected)="onSendMessage($event)"
      />
      <app-chat-input
        [isStreaming]="conversationService.isStreaming()"
        (sendMessage)="onSendMessage($event)"
        (stopGeneration)="onStopGeneration()"
      />
      @if (pendingApproval()) {
      <app-approval-dialog
        [request]="pendingApproval()"
        (approve)="onApprovalResponse($event)"
      />
      }
    </div>
  `,
  styles: `
    .chat-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .chat-header {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 8px 16px;
      border-bottom: 1px solid var(--p-surface-800);
      flex-shrink: 0;
    }
  `,
})
export class ChatPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly conversationService = inject(ConversationService);
  private readonly chatApi = inject(ChatApiService);
  private readonly markdown = inject(MarkdownService);
  private readonly settings = inject(SettingsService);

  readonly statusText = signal('');
  readonly pendingApproval = signal<ApprovalRequest | null>(null);

  private streamSub: Subscription | null = null;
  private routeSub: Subscription | null = null;

  readonly displayMessages = computed(() => {
    const convo = this.conversationService.activeConversation();
    return convo?.displayMessages ?? [];
  });

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.conversationService.setActiveConversation(id);
      } else {
        // /chat with no id — check if there's an active conversation
        const active = this.conversationService.activeConversation();
        if (!active) {
          // Don't auto-create; let the user see the empty state
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.streamSub?.unsubscribe();
  }

  onSendMessage(text: string): void {
    // Ensure we have an active conversation
    let convoId = this.conversationService.activeConversationId();
    if (!convoId) {
      const convo = this.conversationService.createConversation(
        text.slice(0, 50)
      );
      convoId = convo.id;
      this.router.navigate(['/chat', convoId], { replaceUrl: true });
    }

    // If this is the first message, set the title
    const convo = this.conversationService.activeConversation();
    if (convo && convo.messages.length === 0) {
      this.conversationService.renameConversation(
        convoId,
        text.slice(0, 50) + (text.length > 50 ? '...' : '')
      );
    }

    // Add user message
    const userMessage: ChatMessage = { role: 'user', content: text };
    const userDisplay: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    this.conversationService.addMessage(convoId, userMessage, userDisplay);

    // Prepare assistant display message
    const assistantDisplay: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    this.conversationService.addDisplayMessage(convoId, assistantDisplay);

    // Start streaming
    this.conversationService.isStreaming.set(true);
    this.statusText.set('');

    // Cancel any previous stream
    this.streamSub?.unsubscribe();

    // Build messages to send (include system prompt if set)
    const messagesToSend: ChatMessage[] = [];
    const systemPrompt = this.settings.globalSystemPrompt();
    if (systemPrompt) {
      messagesToSend.push({ role: 'system', content: systemPrompt });
    }
    const currentConvo = this.conversationService.activeConversation();
    if (currentConvo) {
      messagesToSend.push(...currentConvo.messages);
    }

    const config = {
      model: this.settings.defaultModel() || undefined,
      temperature: this.settings.temperature(),
    };

    this.streamSub = this.chatApi.streamChat(messagesToSend, config).subscribe({
      next: (event: StreamEvent) => {
        this.handleStreamEvent(convoId!, event);
      },
      complete: () => {
        this.finalizeStream(convoId!);
      },
      error: (error) => {
        console.error('Stream error:', error);
        this.conversationService.updateLastAssistantMessage(
          convoId!,
          '\n\n*Error: Failed to get response. Please try again.*'
        );
        this.finalizeStream(convoId!);
      },
    });
  }

  onStopGeneration(): void {
    this.streamSub?.unsubscribe();
    this.streamSub = null;
    const convoId = this.conversationService.activeConversationId();
    if (convoId) {
      this.finalizeStream(convoId);
    }
  }

  onApprovalResponse(response: ApprovalResponse): void {
    this.pendingApproval.set(null);
    this.chatApi
      .approveToolCall(
        response.approvalId,
        response.approved,
        undefined,
        response.rejectionReason
      )
      .subscribe({
        error: (err) => console.error('Approval failed:', err),
      });
  }

  private handleStreamEvent(convoId: string, event: StreamEvent): void {
    switch (event.type) {
      case 'status':
        this.statusText.set((event.data['message'] as string) || '');
        break;

      case 'token': {
        const token = (event.data['token'] as string) || '';
        if (token) {
          this.conversationService.updateLastAssistantMessage(convoId, token);
        }
        break;
      }

      case 'content': {
        const content = (event.data['content'] as string) || '';
        if (content) {
          this.conversationService.updateLastAssistantMessage(convoId, content);
        }
        break;
      }

      case 'done': {
        // Save the server-provided messages for the next turn
        const messages = event.data['messages'] as ChatMessage[] | undefined;
        if (messages) {
          this.conversationService.setMessagesFromDone(convoId, messages);
        }
        // Cache the final rendered HTML
        this.cacheRenderedHtml(convoId);
        break;
      }

      case 'error': {
        const errorMsg = (event.data['error'] as string) || 'Unknown error';
        this.conversationService.updateLastAssistantMessage(
          convoId,
          `\n\n*Error: ${errorMsg}*`
        );
        break;
      }

      case 'thinking': {
        const thinkingToken = (event.data['token'] as string) || '';
        if (thinkingToken) {
          this.conversationService.updateLastAssistantThinking(
            convoId,
            thinkingToken
          );
        }
        break;
      }

      case 'tool_call_start': {
        const toolCall: DisplayToolCall = {
          name: (event.data['tool'] as string) || 'unknown',
          status: 'pending',
          input: event.data['input'] as Record<string, unknown> | undefined,
        };
        this.conversationService.addToolCallToLastAssistant(convoId, toolCall);
        this.statusText.set(`Using tool: ${toolCall.name}...`);
        break;
      }

      case 'tool_call_end': {
        const toolName = (event.data['tool'] as string) || '';
        const success = event.data['success'] !== false;
        this.conversationService.updateToolCallOnLastAssistant(
          convoId,
          toolName,
          {
            status: success ? 'success' : 'error',
            output: event.data['output'] as string | undefined,
            durationMs: event.data['durationMs'] as number | undefined,
          }
        );
        this.statusText.set('');
        break;
      }

      case 'delegation_start': {
        this.conversationService.addDelegationToLastAssistant(convoId, {
          agentName: (event.data['agent'] as string) || 'sub-agent',
          task: event.data['task'] as string | undefined,
          status: 'pending',
        });
        this.statusText.set(
          `Delegating to ${event.data['agent'] || 'sub-agent'}...`
        );
        break;
      }

      case 'delegation_end': {
        const agentName = (event.data['agent'] as string) || 'sub-agent';
        this.conversationService.updateDelegationOnLastAssistant(
          convoId,
          agentName,
          {
            status: 'complete',
            content: event.data['content'] as string | undefined,
            durationMs: event.data['durationMs'] as number | undefined,
          }
        );
        this.statusText.set('');
        break;
      }

      case 'agent_thinking': {
        const agentName = (event.data['agent'] as string) || 'sub-agent';
        const token = (event.data['token'] as string) || '';
        if (token) {
          this.conversationService.appendDelegationThinking(
            convoId,
            agentName,
            token
          );
        }
        break;
      }

      case 'agent_response': {
        const agentName = (event.data['agent'] as string) || 'sub-agent';
        const content = (event.data['content'] as string) || '';
        if (content) {
          this.conversationService.updateDelegationOnLastAssistant(
            convoId,
            agentName,
            { content }
          );
        }
        break;
      }

      case 'approval_required': {
        const approvalId = (event.data['approvalId'] as string) || '';
        const tool = (event.data['tool'] as string) || '';
        this.conversationService.updateToolCallOnLastAssistant(convoId, tool, {
          status: 'approval-required',
          approvalId,
        });
        this.pendingApproval.set({
          approvalId,
          tool,
          input: (event.data['input'] as Record<string, unknown>) || {},
          message: event.data['message'] as string | undefined,
          agentName: event.data['agent'] as string | undefined,
        });
        this.statusText.set('Waiting for approval...');
        break;
      }

      case 'approval_received': {
        const tool = (event.data['tool'] as string) || '';
        const approved = event.data['approved'] !== false;
        this.conversationService.updateToolCallOnLastAssistant(convoId, tool, {
          status: approved ? 'pending' : 'error',
        });
        this.statusText.set(approved ? `Approved: running ${tool}...` : '');
        break;
      }
    }
  }

  private finalizeStream(convoId: string): void {
    this.conversationService.isStreaming.set(false);
    this.statusText.set('');
    this.cacheRenderedHtml(convoId);
  }

  private cacheRenderedHtml(convoId: string): void {
    const convo = this.conversationService
      .conversations()
      .find((c) => c.id === convoId);
    if (!convo) return;

    const displayMessages = [...convo.displayMessages];
    const last = displayMessages[displayMessages.length - 1];
    if (
      last &&
      last.role === 'assistant' &&
      !last.renderedHtml &&
      last.content
    ) {
      displayMessages[displayMessages.length - 1] = {
        ...last,
        renderedHtml: this.markdown.render(last.content),
      };
      this.conversationService.conversations.update((convos) =>
        convos.map((c) => (c.id === convoId ? { ...c, displayMessages } : c))
      );
    }
  }
}
