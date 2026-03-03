import { Injectable, signal, computed, effect } from '@angular/core';
import {
  Conversation,
  ChatMessage,
  DisplayMessage,
  DisplayToolCall,
  DisplayDelegation,
  ChatConfig,
} from '../models/types';

const STORAGE_KEY = 'chat-conversations';

@Injectable({ providedIn: 'root' })
export class ConversationService {
  readonly conversations = signal<Conversation[]>(this.loadFromStorage());
  readonly activeConversationId = signal<string | null>(null);
  readonly isStreaming = signal(false);

  readonly activeConversation = computed(() => {
    const id = this.activeConversationId();
    if (!id) return null;
    return this.conversations().find((c) => c.id === id) ?? null;
  });

  constructor() {
    effect(() => {
      this.saveToStorage(this.conversations());
    });
  }

  createConversation(title?: string, config?: ChatConfig): Conversation {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: title || 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      displayMessages: [],
      config,
    };
    this.conversations.update((convos) => [conversation, ...convos]);
    this.activeConversationId.set(conversation.id);
    return conversation;
  }

  deleteConversation(id: string): void {
    this.conversations.update((convos) => convos.filter((c) => c.id !== id));
    if (this.activeConversationId() === id) {
      const remaining = this.conversations();
      this.activeConversationId.set(
        remaining.length > 0 ? remaining[0]!.id : null
      );
    }
  }

  renameConversation(id: string, title: string): void {
    this.conversations.update((convos) =>
      convos.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      )
    );
  }

  addMessage(
    conversationId: string,
    message: ChatMessage,
    displayMessage?: DisplayMessage
  ): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: [...c.messages, message],
          displayMessages: displayMessage
            ? [...c.displayMessages, displayMessage]
            : c.displayMessages,
          updatedAt: Date.now(),
        };
      })
    );
  }

  addDisplayMessage(
    conversationId: string,
    displayMessage: DisplayMessage
  ): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          displayMessages: [...c.displayMessages, displayMessage],
          updatedAt: Date.now(),
        };
      })
    );
  }

  updateLastAssistantMessage(conversationId: string, token: string): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const displayMessages = [...c.displayMessages];
        const last = displayMessages[displayMessages.length - 1];
        if (last && last.role === 'assistant') {
          displayMessages[displayMessages.length - 1] = {
            ...last,
            content: last.content + token,
          };
        }
        return { ...c, displayMessages, updatedAt: Date.now() };
      })
    );
  }

  updateLastAssistantThinking(conversationId: string, token: string): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const displayMessages = [...c.displayMessages];
        const last = displayMessages[displayMessages.length - 1];
        if (last && last.role === 'assistant') {
          displayMessages[displayMessages.length - 1] = {
            ...last,
            thinking: (last.thinking || '') + token,
          };
        }
        return { ...c, displayMessages, updatedAt: Date.now() };
      })
    );
  }

  addToolCallToLastAssistant(
    conversationId: string,
    toolCall: DisplayToolCall
  ): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const displayMessages = [...c.displayMessages];
        const last = displayMessages[displayMessages.length - 1];
        if (last && last.role === 'assistant') {
          displayMessages[displayMessages.length - 1] = {
            ...last,
            toolCalls: [...(last.toolCalls || []), toolCall],
          };
        }
        return { ...c, displayMessages, updatedAt: Date.now() };
      })
    );
  }

  updateToolCallOnLastAssistant(
    conversationId: string,
    toolName: string,
    update: Partial<DisplayToolCall>
  ): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const displayMessages = [...c.displayMessages];
        const last = displayMessages[displayMessages.length - 1];
        if (last && last.role === 'assistant' && last.toolCalls) {
          const toolCalls = [...last.toolCalls];
          // Find last matching tool call (most recent)
          for (let i = toolCalls.length - 1; i >= 0; i--) {
            if (
              toolCalls[i].name === toolName &&
              toolCalls[i].status === 'pending'
            ) {
              toolCalls[i] = { ...toolCalls[i], ...update };
              break;
            }
          }
          displayMessages[displayMessages.length - 1] = {
            ...last,
            toolCalls,
          };
        }
        return { ...c, displayMessages, updatedAt: Date.now() };
      })
    );
  }

  addDelegationToLastAssistant(
    conversationId: string,
    delegation: DisplayDelegation
  ): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const displayMessages = [...c.displayMessages];
        const last = displayMessages[displayMessages.length - 1];
        if (last && last.role === 'assistant') {
          displayMessages[displayMessages.length - 1] = {
            ...last,
            delegations: [...(last.delegations || []), delegation],
          };
        }
        return { ...c, displayMessages, updatedAt: Date.now() };
      })
    );
  }

  updateDelegationOnLastAssistant(
    conversationId: string,
    agentName: string,
    update: Partial<DisplayDelegation>
  ): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const displayMessages = [...c.displayMessages];
        const last = displayMessages[displayMessages.length - 1];
        if (last && last.role === 'assistant' && last.delegations) {
          const delegations = [...last.delegations];
          for (let i = delegations.length - 1; i >= 0; i--) {
            if (delegations[i].agentName === agentName) {
              delegations[i] = { ...delegations[i], ...update };
              break;
            }
          }
          displayMessages[displayMessages.length - 1] = {
            ...last,
            delegations,
          };
        }
        return { ...c, displayMessages, updatedAt: Date.now() };
      })
    );
  }

  appendDelegationThinking(
    conversationId: string,
    agentName: string,
    token: string
  ): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const displayMessages = [...c.displayMessages];
        const last = displayMessages[displayMessages.length - 1];
        if (last && last.role === 'assistant' && last.delegations) {
          const delegations = [...last.delegations];
          for (let i = delegations.length - 1; i >= 0; i--) {
            if (delegations[i].agentName === agentName) {
              delegations[i] = {
                ...delegations[i],
                thinking: (delegations[i].thinking || '') + token,
              };
              break;
            }
          }
          displayMessages[displayMessages.length - 1] = {
            ...last,
            delegations,
          };
        }
        return { ...c, displayMessages, updatedAt: Date.now() };
      })
    );
  }

  setMessagesFromDone(conversationId: string, messages: ChatMessage[]): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        return { ...c, messages, updatedAt: Date.now() };
      })
    );
  }

  setActiveConversation(id: string | null): void {
    this.activeConversationId.set(id);
  }

  clearAll(): void {
    this.conversations.set([]);
    this.activeConversationId.set(null);
  }

  exportAll(): string {
    return JSON.stringify(this.conversations());
  }

  importAll(json: string): void {
    try {
      const data = JSON.parse(json) as Conversation[];
      this.conversations.set(data);
    } catch {
      console.error('Failed to import conversations');
    }
  }

  private loadFromStorage(): Conversation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Conversation[];
    } catch {
      return [];
    }
  }

  private saveToStorage(conversations: Conversation[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      console.error('Failed to save conversations to localStorage');
    }
  }
}
