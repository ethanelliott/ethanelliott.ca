import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  OnDestroy,
  computed,
  signal,
  viewChild,
  HostListener,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ConversationService } from '../../services/conversation.service';
import { ChatApiService } from '../../services/chat-api.service';
import { MarkdownService } from '../../services/markdown.service';
import { SettingsService } from '../../services/settings.service';
import {
  ChatMessage,
  DisplayMessage,
  StreamEvent,
  DisplayToolCall,
  FileAttachment,
} from '../../models/types';
import { MessageListComponent } from './message-list.component';
import { ChatInputComponent, SendMessageEvent } from './chat-input.component';
import { ModelSelectorComponent } from './model-selector.component';
import {
  ApprovalDialogComponent,
  ApprovalRequest,
  ApprovalResponse,
} from './approval-dialog.component';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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
    <div
      class="chat-page"
      [class.drag-over]="isDragOver()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <div class="chat-header">
        <app-model-selector />
      </div>
      <app-message-list
        [messages]="displayMessages()"
        [isStreaming]="conversationService.isStreaming()"
        [statusText]="statusText()"
        (suggestionSelected)="onSuggestionSelected($event)"
      />
      <app-chat-input
        #chatInput
        [isStreaming]="conversationService.isStreaming()"
        (sendMessage)="onSendMessage($event)"
        (stopGeneration)="onStopGeneration()"
      />
      @if (pendingApproval()) {
      <app-approval-dialog
        [request]="pendingApproval()"
        (approve)="onApprovalResponse($event)"
      />
      } @if (isDragOver()) {
      <div class="drop-overlay">
        <div class="drop-overlay-content">
          <i class="pi pi-upload"></i>
          <span>Drop files here</span>
        </div>
      </div>
      }
    </div>
  `,
  styles: `
    .chat-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      position: relative;
    }

    .chat-header {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 8px 16px;
      border-bottom: 1px solid var(--p-surface-800);
      flex-shrink: 0;
    }

    .drop-overlay {
      position: absolute;
      inset: 0;
      background: rgba(59, 130, 246, 0.1);
      border: 2px dashed var(--p-primary-color);
      border-radius: 8px;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .drop-overlay-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: var(--p-primary-color);
      font-size: 1.1rem;
      font-weight: 600;

      i {
        font-size: 2rem;
      }
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
  private readonly messageService = inject(MessageService);

  readonly statusText = signal('');
  readonly pendingApproval = signal<ApprovalRequest | null>(null);
  readonly isDragOver = signal(false);
  private readonly chatInput = viewChild<ChatInputComponent>('chatInput');

  private streamSub: Subscription | null = null;
  private routeSub: Subscription | null = null;
  private dragCounter = 0;

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

  onSuggestionSelected(text: string): void {
    this.onSendMessage({ text, attachments: [] });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter++;
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.isDragOver.set(false);
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter = 0;
    this.isDragOver.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) {
      this.chatInput()?.addFiles(files);
    }
  }

  onSendMessage(event: SendMessageEvent): void {
    const { text, attachments } = event;

    // Separate images and text files
    const imageAttachments = attachments.filter((a) =>
      IMAGE_TYPES.includes(a.type)
    );
    const textAttachments = attachments.filter(
      (a) => !IMAGE_TYPES.includes(a.type)
    );

    // Build content: original text + inlined text file contents
    let fullContent = text;
    for (const att of textAttachments) {
      const decoded = decodeURIComponent(escape(atob(att.base64)));
      fullContent += `\n\n--- ${att.name} ---\n${decoded}`;
    }

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
      // Background LLM call to refine the title
      this.chatApi.generateTitle(text).subscribe({
        next: (title) => {
          if (title) {
            this.conversationService.renameConversation(convoId!, title);
          }
        },
      });
    }

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: fullContent,
      images: imageAttachments.length
        ? imageAttachments.map((a) => a.base64)
        : undefined,
    };
    const userDisplay: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content:
        text ||
        (attachments.length ? `[${attachments.length} file(s) attached]` : ''),
      attachments: attachments.length ? attachments : undefined,
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
        this.messageService.add({
          severity: 'error',
          summary: 'Stream Error',
          detail: 'Failed to get response. Please try again.',
          life: 5000,
        });
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
        error: (err) => {
          console.error('Approval failed:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Approval Failed',
            detail: 'Could not send approval response.',
            life: 4000,
          });
        },
      });
  }

  private handleStreamEvent(convoId: string, event: StreamEvent): void {
    switch (event.type) {
      case 'status':
        this.statusText.set((event.data['message'] as string) || '');
        break;

      case 'token': {
        const token = (event.data['token'] as string) || '';
        const role = (event.data['role'] as string) || 'assistant';
        const agentName = event.data['agentName'] as string | undefined;
        if (token) {
          // Tokens from sub-agents go into delegation thinking
          if (role === 'agent' && agentName) {
            this.conversationService.appendDelegationThinking(
              convoId,
              agentName,
              token
            );
          } else {
            this.conversationService.updateLastAssistantMessage(convoId, token);
          }
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
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMsg,
          life: 5000,
        });
        this.conversationService.updateLastAssistantMessage(
          convoId,
          `\n\n*Error: ${errorMsg}*`
        );
        break;
      }

      case 'thinking': {
        // Backend sends { message } for orchestrator thinking status
        const thinkingMsg =
          (event.data['message'] as string) ||
          (event.data['token'] as string) ||
          '';
        if (thinkingMsg) {
          this.statusText.set(thinkingMsg);
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
        // Backend sends result object with success field
        const output = event.data['output'] as
          | Record<string, unknown>
          | undefined;
        const success = output ? output['success'] !== false : true;
        this.conversationService.updateToolCallOnLastAssistant(
          convoId,
          toolName,
          {
            status: success ? 'success' : 'error',
            output: output ? JSON.stringify(output, null, 2) : undefined,
            durationMs: event.data['durationMs'] as number | undefined,
          }
        );
        this.statusText.set('');
        break;
      }

      case 'delegation_start': {
        // Backend sends agentName, not agent
        const agentName =
          (event.data['agentName'] as string) ||
          (event.data['agent'] as string) ||
          'sub-agent';
        this.conversationService.addDelegationToLastAssistant(convoId, {
          agentName,
          task: event.data['task'] as string | undefined,
          status: 'pending',
        });
        this.statusText.set(`Delegating to ${agentName}...`);
        break;
      }

      case 'delegation_end': {
        // Backend sends agentName + response (not agent + content)
        const agentName =
          (event.data['agentName'] as string) ||
          (event.data['agent'] as string) ||
          'sub-agent';
        this.conversationService.updateDelegationOnLastAssistant(
          convoId,
          agentName,
          {
            status: 'complete',
            content:
              (event.data['response'] as string) ||
              (event.data['content'] as string) ||
              undefined,
            durationMs: event.data['durationMs'] as number | undefined,
          }
        );
        this.statusText.set('');
        break;
      }

      case 'agent_thinking': {
        // Backend sends { agentName, iteration, maxIterations }
        const agentName =
          (event.data['agentName'] as string) ||
          (event.data['agent'] as string) ||
          'sub-agent';
        const iteration = event.data['iteration'] as number | undefined;
        const maxIterations = event.data['maxIterations'] as number | undefined;
        const statusMsg =
          iteration && maxIterations
            ? `${agentName} thinking (${iteration}/${maxIterations})...`
            : `${agentName} thinking...`;
        this.statusText.set(statusMsg);
        break;
      }

      case 'agent_response': {
        // Backend sends agentName, not agent
        const agentName =
          (event.data['agentName'] as string) ||
          (event.data['agent'] as string) ||
          'sub-agent';
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
          agentName:
            (event.data['agentName'] as string) ||
            (event.data['agent'] as string) ||
            undefined,
        });
        this.statusText.set('Waiting for approval...');
        break;
      }

      case 'approval_received': {
        // Backend sends { approvalId, approved, ... }
        const approvalId = (event.data['approvalId'] as string) || '';
        const approved = event.data['approved'] !== false;
        // Find the tool that has this approvalId
        const convo = this.conversationService.activeConversation();
        if (convo) {
          const lastMsg =
            convo.displayMessages[convo.displayMessages.length - 1];
          const pendingTool = lastMsg?.toolCalls?.find(
            (tc) => tc.approvalId === approvalId
          );
          if (pendingTool) {
            this.conversationService.updateToolCallOnLastAssistant(
              convoId,
              pendingTool.name,
              {
                status: approved ? 'pending' : 'error',
              }
            );
          }
        }
        this.statusText.set(approved ? 'Approved, running...' : '');
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
