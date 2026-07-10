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
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ConversationService } from '../../services/conversation.service';
import { ChatApiService } from '../../services/chat-api.service';
import { MarkdownService } from '../../services/markdown.service';
import { SettingsService } from '../../services/settings.service';
import { CanvasService } from '../../services/canvas.service';
import {
  ChatMessage,
  DisplayMessage,
  StreamEvent,
  DisplayToolCall,
  FileAttachment,
  Artifact,
} from '../../models/types';
import {
  MessageListComponent,
  LiveGenerationStats,
} from './message-list.component';
import { EditMessageEvent } from './message-bubble.component';
import { ChatInputComponent, SendMessageEvent } from './chat-input.component';
import { ModelSelectorComponent } from './model-selector.component';
import { ArtifactCanvasComponent } from './artifact-canvas.component';
import {
  ApprovalDialogComponent,
  ApprovalRequest,
  ApprovalResponse,
} from './approval-dialog.component';
import {
  QuestionnaireDialogComponent,
  QuestionnaireRequest,
  QuestionnaireResponse,
} from './questionnaire-dialog.component';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [
    FormsModule,
    MessageListComponent,
    ChatInputComponent,
    ModelSelectorComponent,
    ApprovalDialogComponent,
    QuestionnaireDialogComponent,
    ArtifactCanvasComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-shell" [class.canvas-open]="canvasVisible()">
    <div
      class="chat-page"
      [class.drag-over]="isDragOver()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <div class="chat-header">
        <div class="header-left">
          @if (activeTitle() !== null) { @if (isEditingTitle()) {
          <input
            class="title-input"
            [(ngModel)]="titleDraft"
            (keydown.enter)="saveTitle()"
            (keydown.escape)="cancelTitleEdit($event)"
            (blur)="saveTitle()"
            #titleInput
          />
          } @else {
          <button
            class="header-title"
            (click)="startTitleEdit()"
            title="Rename conversation"
          >
            {{ activeTitle() }}
            <i class="pi pi-pencil"></i>
          </button>
          } }
        </div>
        <div class="header-right">
          @if (artifacts().length && !canvas.isOpen()) {
          <button
            class="header-btn"
            title="Show artifact canvas"
            (click)="canvas.open()"
          >
            <i class="pi pi-palette"></i>
            <span>Canvas</span>
          </button>
          } @if (displayMessages().length) {
          <button
            class="header-btn"
            title="Export conversation as Markdown"
            (click)="exportConversation()"
          >
            <i class="pi pi-download"></i>
          </button>
          }
          <app-model-selector />
        </div>
      </div>
      <app-message-list
        [messages]="displayMessages()"
        [isStreaming]="conversationService.isStreaming()"
        [statusText]="statusText()"
        [liveStats]="liveStats()"
        (suggestionSelected)="onSuggestionSelected($event)"
        (regenerateRequested)="onRegenerate()"
        (editSubmitted)="onEditSubmitted($event)"
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
      } @if (pendingQuestion()) {
      <app-questionnaire-dialog
        [request]="pendingQuestion()"
        (respond)="onQuestionnaireResponse($event)"
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
    @if (canvasVisible()) {
    <app-artifact-canvas
      class="canvas-pane"
      [artifacts]="artifacts()"
      [activeId]="canvas.activeArtifactId()"
      (closePanel)="canvas.close()"
      (activeIdChange)="canvas.activeArtifactId.set($event)"
    />
    }
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .chat-shell {
      display: flex;
      flex-direction: row;
      height: 100%;
      overflow: hidden;
    }

    .chat-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      position: relative;
      background:
        radial-gradient(
          ellipse 60% 40% at 50% -10%,
          color-mix(in srgb, var(--p-primary-500) 7%, transparent),
          transparent
        ),
        var(--p-surface-950);
    }

    .canvas-pane {
      flex: 1 1 0;
      min-width: 0;
      height: 100%;
      border-left: 1px solid var(--p-surface-800);
    }

    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 16px;
      border-bottom: 1px solid
        color-mix(in srgb, var(--p-surface-800) 70%, transparent);
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      min-height: 32px;
      min-width: 0;
      flex: 1;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .header-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: none;
      border-radius: 8px;
      padding: 4px 10px;
      font-family: inherit;
      font-size: 0.86rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--p-text-color);
      cursor: pointer;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      i {
        font-size: 0.62rem;
        color: var(--p-text-muted-color);
        opacity: 0;
        transition: opacity 0.15s ease;
      }

      &:hover {
        background: var(--p-surface-800);

        i { opacity: 1; }
      }
    }

    .title-input {
      background: var(--p-surface-900);
      border: 1px solid var(--chat-accent);
      border-radius: 8px;
      padding: 4px 10px;
      font-family: inherit;
      font-size: 0.86rem;
      font-weight: 600;
      color: var(--p-text-color);
      outline: none;
      min-width: 240px;
    }

    .header-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: 1px solid var(--p-surface-800);
      border-radius: 9px;
      padding: 6px 10px;
      font-family: inherit;
      font-size: 0.76rem;
      font-weight: 500;
      color: var(--p-text-muted-color);
      cursor: pointer;
      transition: color 0.15s ease, border-color 0.15s ease;

      i { font-size: 0.8rem; }

      &:hover {
        color: var(--p-text-color);
        border-color: var(--p-surface-600);
      }
    }

    @media (max-width: 900px) {
      .chat-shell.canvas-open .chat-page {
        display: none;
      }

      .canvas-pane {
        border-left: none;
      }
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
  readonly canvas = inject(CanvasService);

  readonly statusText = signal('');
  readonly pendingApproval = signal<ApprovalRequest | null>(null);
  readonly pendingQuestion = signal<QuestionnaireRequest | null>(null);
  readonly isDragOver = signal(false);
  readonly liveStats = signal<LiveGenerationStats | null>(null);
  readonly isEditingTitle = signal(false);
  titleDraft = '';
  private readonly chatInput = viewChild<ChatInputComponent>('chatInput');

  private streamSub: Subscription | null = null;
  private routeSub: Subscription | null = null;
  private dragCounter = 0;
  private streamStartTime = 0;
  private liveTokenCount = 0;

  readonly displayMessages = computed(() => {
    const convo = this.conversationService.activeConversation();
    return convo?.displayMessages ?? [];
  });

  readonly activeTitle = computed<string | null>(() => {
    const convo = this.conversationService.activeConversation();
    return convo?.title ?? null;
  });

  readonly artifacts = computed<Artifact[]>(() => {
    const convo = this.conversationService.activeConversation();
    return convo?.artifacts ?? [];
  });

  readonly canvasVisible = computed(
    () => this.canvas.isOpen() && this.artifacts().length > 0
  );

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.conversationService.setActiveConversation(id);
        // Show the latest artifact for the newly active conversation.
        this.canvas.activeArtifactId.set(null);
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.conversationService.isStreaming()) {
      this.onStopGeneration();
    }
  }

  startTitleEdit(): void {
    this.titleDraft = this.activeTitle() ?? '';
    this.isEditingTitle.set(true);
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('.title-input')?.select();
    });
  }

  saveTitle(): void {
    if (!this.isEditingTitle()) return;
    this.isEditingTitle.set(false);
    const convoId = this.conversationService.activeConversationId();
    const title = this.titleDraft.trim();
    if (convoId && title && title !== this.activeTitle()) {
      this.conversationService.renameConversation(convoId, title);
    }
  }

  cancelTitleEdit(event: Event): void {
    event.stopPropagation();
    this.isEditingTitle.set(false);
  }

  /** Download the active conversation as a Markdown file. */
  exportConversation(): void {
    const convo = this.conversationService.activeConversation();
    if (!convo) return;

    const lines: string[] = [
      `# ${convo.title}`,
      '',
      `_Exported ${new Date().toLocaleString()}_`,
      '',
    ];
    for (const msg of convo.displayMessages) {
      lines.push(msg.role === 'user' ? '## You' : '## Assistant');
      lines.push('');
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          lines.push(`> 🔧 \`${tc.name}\` (${tc.status})`);
        }
        lines.push('');
      }
      lines.push(msg.content || '_(no content)_');
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${convo.title.replace(/[^\w\s-]/g, '').trim() || 'conversation'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** Edit-and-resend: truncate the conversation at the edited user message. */
  onEditSubmitted(event: EditMessageEvent): void {
    if (this.conversationService.isStreaming()) return;
    const convoId = this.conversationService.activeConversationId();
    if (!convoId) return;
    if (
      !this.conversationService.truncateFromUserMessage(
        convoId,
        event.messageId
      )
    ) {
      return;
    }
    this.onSendMessage({ text: event.content, attachments: [] });
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

    this.beginAssistantStream(convoId);
  }

  /**
   * Re-run the last user message. Drops the trailing assistant reply and
   * streams a fresh one.
   */
  onRegenerate(): void {
    if (this.conversationService.isStreaming()) return;
    const convoId = this.conversationService.activeConversationId();
    if (!convoId) return;
    if (!this.conversationService.prepareRegenerate(convoId)) return;
    this.beginAssistantStream(convoId);
  }

  /**
   * Add an empty assistant display message and stream the model's reply into
   * it, using the conversation's current message history.
   */
  private beginAssistantStream(convoId: string): void {
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
    this.streamStartTime = Date.now();
    this.liveTokenCount = 0;
    this.liveStats.set(null);

    // Cancel any previous stream
    this.streamSub?.unsubscribe();

    // Build messages to send (include system prompt if set)
    const messagesToSend: ChatMessage[] = [];
    const systemPrompt = this.settings.globalSystemPrompt();
    if (systemPrompt) {
      messagesToSend.push({ role: 'system', content: systemPrompt });
    }
    const currentConvo = this.conversationService
      .conversations()
      .find((c) => c.id === convoId);
    if (currentConvo) {
      // Strip system messages already stored in history (the done event
      // echoes them back) so the prompt doesn't accumulate once per turn
      messagesToSend.push(
        ...currentConvo.messages.filter((m) => m.role !== 'system')
      );
    }

    const config = {
      model: this.settings.defaultModel() || undefined,
      temperature: this.settings.temperature(),
    };

    this.streamSub = this.chatApi.streamChat(messagesToSend, config).subscribe({
      next: (event: StreamEvent) => {
        this.handleStreamEvent(convoId, event);
      },
      complete: () => {
        this.finalizeStream(convoId);
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
          convoId,
          '\n\n*Error: Failed to get response. Please try again.*'
        );
        this.finalizeStream(convoId);
      },
    });
  }

  onStopGeneration(): void {
    this.streamSub?.unsubscribe();
    this.streamSub = null;
    const convoId = this.conversationService.activeConversationId();
    if (convoId) {
      // Keep the partial reply in the model's context for the next turn
      this.conversationService.commitPartialAssistant(convoId);
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

  onQuestionnaireResponse(response: QuestionnaireResponse): void {
    this.pendingQuestion.set(null);
    this.chatApi
      .approveToolCall(response.approvalId, true, {
        answers: JSON.stringify(response.answers),
      })
      .subscribe({
        error: (err) => {
          console.error('Questionnaire response failed:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Response Failed',
            detail: 'Could not send your answer.',
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
          this.trackLiveToken();
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
        // Attach stats to the last assistant display message
        const stats = event.data['stats'] as
          | Record<string, unknown>
          | undefined;
        if (stats) {
          this.conversationService.setLastAssistantStats(convoId, {
            model: stats['model'] as string | undefined,
            tokensPerSecond: stats['tokensPerSecond'] as number | undefined,
            totalTokens: stats['totalTokens'] as number | undefined,
            promptTokens: stats['promptTokens'] as number | undefined,
            completionTokens: stats['completionTokens'] as number | undefined,
            reasoningTokens: stats['reasoningTokens'] as number | undefined,
            reasoningDurationMs: stats['reasoningDurationMs'] as
              | number
              | undefined,
            timeToFirstTokenMs: stats['timeToFirstTokenMs'] as
              | number
              | undefined,
            totalDurationMs: stats['totalDurationMs'] as number | undefined,
          });
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

      case 'thinking_token': {
        // Reasoning tokens from <think> tags — stream into the thinking section
        const thinkToken = (event.data['token'] as string) || '';
        const thinkRole = (event.data['role'] as string) || 'assistant';
        const thinkAgentName = event.data['agentName'] as string | undefined;
        if (thinkToken) {
          this.trackLiveToken();
          if (thinkRole === 'agent' && thinkAgentName) {
            this.conversationService.appendDelegationThinking(
              convoId,
              thinkAgentName,
              thinkToken
            );
          } else {
            this.conversationService.updateLastAssistantThinking(
              convoId,
              thinkToken
            );
          }
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
        // Artifact tools render live in the canvas as soon as the HTML arrives.
        this.handleArtifactTool(convoId, toolCall.name, toolCall.input);
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
        const toolInput =
          (event.data['input'] as Record<string, unknown>) || {};
        const agentName =
          (event.data['agentName'] as string) ||
          (event.data['agent'] as string) ||
          undefined;

        this.conversationService.updateToolCallOnLastAssistant(convoId, tool, {
          status: 'approval-required',
          approvalId,
        });

        // ask_user tool → show questionnaire dialog instead of approval
        if (tool === 'ask_user') {
          const rawQuestions =
            (toolInput['questions'] as Array<Record<string, unknown>>) || [];
          const questions = rawQuestions.map((q) => ({
            question: (q['question'] as string) || 'Please answer:',
            options: (q['options'] as string[]) || [],
            allowFreeText: q['allow_free_text'] !== false,
          }));
          // Fallback: if no questions array, treat as single question (backward compat)
          if (questions.length === 0) {
            questions.push({
              question: (toolInput['question'] as string) || 'Please choose:',
              options: (toolInput['options'] as string[]) || [],
              allowFreeText: toolInput['allow_free_text'] !== false,
            });
          }
          this.pendingQuestion.set({
            approvalId,
            questions,
            agentName,
          });
          this.statusText.set('Waiting for your answer...');
        } else {
          this.pendingApproval.set({
            approvalId,
            tool,
            input: toolInput,
            message: event.data['message'] as string | undefined,
            agentName,
          });
          this.statusText.set('Waiting for approval...');
        }
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

  /**
   * Detect artifact tool calls and render/update the canvas live.
   * The HTML payload rides in the tool-call input.
   */
  private handleArtifactTool(
    convoId: string,
    toolName: string,
    input: Record<string, unknown> | undefined
  ): void {
    if (
      !input ||
      (toolName !== 'create_artifact' && toolName !== 'update_artifact')
    ) {
      return;
    }

    const html = typeof input['html'] === 'string' ? input['html'] : '';
    if (!html.trim()) return;
    const title =
      typeof input['title'] === 'string'
        ? (input['title'] as string)
        : undefined;

    let artifact;
    if (toolName === 'update_artifact') {
      artifact = this.conversationService.updateArtifact(convoId, {
        html,
        title,
      });
      // Fall back to creating one if there was nothing to update.
      if (!artifact) {
        artifact = this.conversationService.createArtifact(
          convoId,
          title || 'Artifact',
          html
        );
      }
    } else {
      artifact = this.conversationService.createArtifact(
        convoId,
        title || 'Artifact',
        html
      );
    }

    this.canvas.open(artifact.id);
  }

  /** Update the live tok/s readout shown in the status line while streaming. */
  private trackLiveToken(): void {
    this.liveTokenCount++;
    const elapsedMs = Date.now() - this.streamStartTime;
    this.liveStats.set({
      tokens: this.liveTokenCount,
      tokensPerSecond:
        elapsedMs > 0 ? (this.liveTokenCount / elapsedMs) * 1000 : 0,
      elapsedMs,
    });
  }

  private finalizeStream(convoId: string): void {
    this.conversationService.isStreaming.set(false);
    this.statusText.set('');
    this.liveStats.set(null);
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
