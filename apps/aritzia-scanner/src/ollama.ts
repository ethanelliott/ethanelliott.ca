const OLLAMA_URL = process.env.OLLAMA_URL || 'https://ollama.elliott.haus';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';
const DEFAULT_TIMEOUT_MS = 180000; // 3 minutes

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: string[];
  description?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  format?: JsonSchema;
}

interface OllamaChatRequest {
  model: string;
  messages: Message[];
  stream: boolean;
  format?: JsonSchema;
  options?: {
    temperature?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

// Streaming chunk from Ollama
interface OllamaStreamChunk {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaClient {
  private baseUrl: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;

  constructor(
    baseUrl: string = OLLAMA_URL,
    defaultModel: string = DEFAULT_MODEL,
    defaultTimeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Non-streaming chat request
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort('Request timeout'),
      timeoutMs
    );

    try {
      const request: OllamaChatRequest = {
        model,
        messages,
        stream: false,
        ...(options?.format && { format: options.format }),
        ...(options?.temperature !== undefined && {
          options: { temperature: options.temperature },
        }),
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama request failed: ${response.status} - ${errorText}`
        );
      }

      const data: OllamaChatResponse = await response.json();
      return data.message.content;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
        }
        throw new Error(`Ollama request failed: ${error.message}`);
      }
      throw new Error('Ollama request failed: Unknown error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Streaming chat request - yields chunks as they arrive.
   * Perfect for Server-Sent Events (SSE).
   */
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<{ content: string; done: boolean; thinking?: boolean }> {
    const model = options?.model ?? this.defaultModel;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort('Request timeout'),
      timeoutMs
    );

    try {
      const request: OllamaChatRequest = {
        model,
        messages,
        stream: true,
        ...(options?.format && { format: options.format }),
        ...(options?.temperature !== undefined && {
          options: { temperature: options.temperature },
        }),
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama stream failed: ${response.status} - ${errorText}`
        );
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let inThinkBlock = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk: OllamaStreamChunk = JSON.parse(line);
            const content = chunk.message?.content || '';

            // Track <think> blocks for reasoning display
            if (content.includes('<think>')) {
              inThinkBlock = true;
            }
            if (content.includes('</think>')) {
              inThinkBlock = false;
              yield { content, done: false, thinking: true };
              continue;
            }

            yield {
              content,
              done: chunk.done,
              thinking: inThinkBlock,
            };
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const chunk: OllamaStreamChunk = JSON.parse(buffer);
          yield {
            content: chunk.message?.content || '',
            done: chunk.done,
            thinking: false,
          };
        } catch {
          // Skip
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama stream timed out after ${timeoutMs}ms`);
        }
        throw new Error(`Ollama stream failed: ${error.message}`);
      }
      throw new Error('Ollama stream failed: Unknown error');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton instance
let ollamaInstance: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!ollamaInstance) {
    ollamaInstance = new OllamaClient();
  }
  return ollamaInstance;
}
