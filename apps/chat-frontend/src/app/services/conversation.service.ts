import { Injectable, signal, computed, effect } from '@angular/core';
import {
  Conversation,
  ChatMessage,
  DisplayMessage,
  DisplayToolCall,
  DisplayDelegation,
  ChatConfig,
  MessageStats,
  Artifact,
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

  togglePin(id: string): void {
    this.conversations.update((convos) =>
      convos.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
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

  /**
   * Commit the partially streamed assistant reply into the API message
   * history. Used when generation is stopped early — without this the model
   * would never see its own partial answer on the next turn.
   */
  commitPartialAssistant(conversationId: string): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const lastDisplay = c.displayMessages[c.displayMessages.length - 1];
        const lastMessage = c.messages[c.messages.length - 1];
        if (
          !lastDisplay ||
          lastDisplay.role !== 'assistant' ||
          !lastDisplay.content ||
          lastMessage?.role !== 'user'
        ) {
          return c;
        }
        return {
          ...c,
          messages: [
            ...c.messages,
            { role: 'assistant' as const, content: lastDisplay.content },
          ],
          updatedAt: Date.now(),
        };
      })
    );
  }

  /**
   * Drop the trailing assistant turn (display + API messages) so the last
   * user message can be re-sent. Returns true when there is a user message
   * to regenerate from.
   */
  prepareRegenerate(conversationId: string): boolean {
    let canRegenerate = false;
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;

        const messages = [...c.messages];
        while (
          messages.length &&
          messages[messages.length - 1].role !== 'user'
        ) {
          messages.pop();
        }
        if (!messages.some((m) => m.role === 'user')) return c;

        const displayMessages = [...c.displayMessages];
        while (
          displayMessages.length &&
          displayMessages[displayMessages.length - 1].role === 'assistant'
        ) {
          displayMessages.pop();
        }

        canRegenerate = true;
        return { ...c, messages, displayMessages, updatedAt: Date.now() };
      })
    );
    return canRegenerate;
  }

  /**
   * Remove a user display message (found by id) and everything after it, in
   * both display and API histories, so the message can be edited and re-sent.
   * Returns true when the truncation happened.
   */
  truncateFromUserMessage(
    conversationId: string,
    displayMessageId: string
  ): boolean {
    let truncated = false;
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;

        const displayIndex = c.displayMessages.findIndex(
          (m) => m.id === displayMessageId && m.role === 'user'
        );
        if (displayIndex < 0) return c;

        // The nth user display message corresponds to the nth user message
        // in the API history (assistant/tool messages interleave freely)
        const userOrdinal = c.displayMessages
          .slice(0, displayIndex + 1)
          .filter((m) => m.role === 'user').length;

        let seen = 0;
        let messageIndex = c.messages.length;
        for (let i = 0; i < c.messages.length; i++) {
          if (c.messages[i].role === 'user') {
            seen++;
            if (seen === userOrdinal) {
              messageIndex = i;
              break;
            }
          }
        }

        truncated = true;
        return {
          ...c,
          messages: c.messages.slice(0, messageIndex),
          displayMessages: c.displayMessages.slice(0, displayIndex),
          updatedAt: Date.now(),
        };
      })
    );
    return truncated;
  }

  setMessagesFromDone(conversationId: string, messages: ChatMessage[]): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        return { ...c, messages, updatedAt: Date.now() };
      })
    );
  }

  setLastAssistantStats(conversationId: string, stats: MessageStats): void {
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const displayMessages = [...c.displayMessages];
        // Find the last assistant message and attach stats
        for (let i = displayMessages.length - 1; i >= 0; i--) {
          if (displayMessages[i].role === 'assistant') {
            displayMessages[i] = { ...displayMessages[i], stats };
            break;
          }
        }
        return { ...c, displayMessages, updatedAt: Date.now() };
      })
    );
  }

  /**
   * Create a new artifact on a conversation and return it.
   */
  createArtifact(
    conversationId: string,
    title: string,
    html: string
  ): Artifact {
    const artifact: Artifact = {
      id: crypto.randomUUID(),
      title: title || 'Untitled Artifact',
      html,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          artifacts: [...(c.artifacts || []), artifact],
          updatedAt: Date.now(),
        };
      })
    );
    return artifact;
  }

  /**
   * Update an existing artifact's HTML (and optionally its title), bumping the
   * version. If no artifactId is given, the most recently updated artifact is
   * patched. Returns the affected artifact, or null if there was none.
   */
  updateArtifact(
    conversationId: string,
    patch: { html: string; title?: string; artifactId?: string }
  ): Artifact | null {
    let updated: Artifact | null = null;
    this.conversations.update((convos) =>
      convos.map((c) => {
        if (c.id !== conversationId) return c;
        const artifacts = [...(c.artifacts || [])];
        if (artifacts.length === 0) return c;

        let index = artifacts.length - 1;
        if (patch.artifactId) {
          const found = artifacts.findIndex((a) => a.id === patch.artifactId);
          if (found >= 0) index = found;
        }

        const current = artifacts[index];
        updated = {
          ...current,
          html: patch.html,
          title: patch.title?.trim() || current.title,
          updatedAt: Date.now(),
          version: current.version + 1,
        };
        artifacts[index] = updated;
        return { ...c, artifacts, updatedAt: Date.now() };
      })
    );
    return updated;
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
      const convos = JSON.parse(raw) as Conversation[];
      // Strip cached renderedHtml — it's a transient cache that should be
      // re-rendered with the current markdown pipeline on each load
      for (const convo of convos) {
        for (const msg of convo.displayMessages) {
          delete msg.renderedHtml;
        }
      }
      return convos;
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
