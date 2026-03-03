import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { StreamEvent, ChatMessage, ChatConfig } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  streamChat(
    messages: ChatMessage[],
    config?: ChatConfig
  ): Observable<StreamEvent> {
    return new Observable((subscriber) => {
      const abortController = new AbortController();

      fetch(`${this.baseUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, config }),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Chat stream failed: ${response.status}`);
          }
          if (!response.body) {
            throw new Error('Response body is null');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let done = false;

          while (!done) {
            const result = await reader.read();
            done = result.done;
            if (done) break;

            buffer += decoder.decode(result.value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed) as StreamEvent;
                subscriber.next(parsed);
                if (parsed.type === 'done' || parsed.type === 'error') {
                  subscriber.complete();
                  return;
                }
              } catch {
                // Skip malformed NDJSON lines
              }
            }
          }
          subscriber.complete();
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            subscriber.error(error);
          }
        });

      return () => abortController.abort();
    });
  }

  approveToolCall(
    approvalId: string,
    approved: boolean,
    userParameters?: Record<string, unknown>,
    rejectionReason?: string
  ): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/chat/approve`, {
      approvalId,
      approved,
      userParameters,
      rejectionReason,
    });
  }

  getModels(): Observable<{
    count: number;
    models: Array<{ name: string; sizeGb: number; details: unknown }>;
  }> {
    return this.http.get<{
      count: number;
      models: Array<{ name: string; sizeGb: number; details: unknown }>;
    }>(`${this.baseUrl}/agents/models`);
  }

  getTools(): Observable<{
    count: number;
    categories: string[];
    tools: unknown[];
  }> {
    return this.http.get<{
      count: number;
      categories: string[];
      tools: unknown[];
    }>(`${this.baseUrl}/tools`);
  }

  getToolCategories(): Observable<{ categories: string[] }> {
    return this.http.get<{ categories: string[] }>(
      `${this.baseUrl}/tools/categories`
    );
  }

  getAgents(): Observable<{ count: number; agents: unknown[] }> {
    return this.http.get<{ count: number; agents: unknown[] }>(
      `${this.baseUrl}/agents`
    );
  }

  /**
   * Generate a short title for a conversation based on the first message.
   * Uses the chat stream endpoint with a special system prompt to get a title.
   */
  generateTitle(userMessage: string): Observable<string> {
    return new Observable((subscriber) => {
      const messages = [
        {
          role: 'system',
          content:
            'Generate a very short title (max 6 words) for a conversation that starts with the following user message. Reply ONLY with the title, no quotes, no punctuation at the end, no explanation.',
        },
        { role: 'user', content: userMessage },
      ];

      fetch(`${this.baseUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          config: { temperature: 0.3 },
        }),
      })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            subscriber.error(new Error('Title generation failed'));
            return;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let title = '';
          let done = false;

          while (!done) {
            const result = await reader.read();
            done = result.done;
            if (done) break;
            buffer += decoder.decode(result.value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.type === 'token' || parsed.type === 'content') {
                  title +=
                    (parsed.data?.token as string) ||
                    (parsed.data?.content as string) ||
                    '';
                }
                if (parsed.type === 'done' || parsed.type === 'error') {
                  done = true;
                  break;
                }
              } catch {
                // skip
              }
            }
          }

          const cleaned = title.trim().replace(/^["']|["']$/g, '');
          if (cleaned) {
            subscriber.next(cleaned);
          }
          subscriber.complete();
        })
        .catch((err) => subscriber.error(err));
    });
  }
}
