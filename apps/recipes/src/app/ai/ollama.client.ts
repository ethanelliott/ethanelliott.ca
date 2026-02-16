import { logger } from '../logger';

const OLLAMA_URL = process.env.OLLAMA_URL || 'https://ollama.elliott.haus';
const DEFAULT_MODEL = 'qwen3:8b';
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// JSON Schema type for structured output
export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: string[];
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

export interface OllamaStreamChunk {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
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
   * Send a chat request to Ollama and get the response text
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    logger.info(
      { model, messageCount: messages.length, hasFormat: !!options?.format },
      'Ollama chat request'
    );

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
      logger.info(
        {
          model,
          durationMs: data.total_duration
            ? Math.round(data.total_duration / 1e6)
            : undefined,
          promptTokens: data.prompt_eval_count,
          evalTokens: data.eval_count,
        },
        'Ollama chat response'
      );
      return data.message.content;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.warn({ model, timeoutMs }, 'Ollama chat request timed out');
          throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
        }
        logger.error({ err: error, model }, 'Ollama chat request failed');
        throw new Error(`Ollama request failed: ${error.message}`);
      }
      throw new Error('Ollama request failed: Unknown error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Send a streaming chat request to Ollama, yielding tokens as they arrive
   */
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<OllamaStreamChunk> {
    const model = options?.model ?? this.defaultModel;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    logger.info(
      { model, messageCount: messages.length },
      'Ollama stream request'
    );

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

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const chunk: OllamaStreamChunk = JSON.parse(trimmed);
            yield chunk;
          } catch {
            // Skip malformed lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const chunk: OllamaStreamChunk = JSON.parse(buffer.trim());
          yield chunk;
        } catch {
          // Skip malformed final line
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
        }
        throw new Error(`Ollama stream failed: ${error.message}`);
      }
      throw new Error('Ollama stream failed: Unknown error');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
