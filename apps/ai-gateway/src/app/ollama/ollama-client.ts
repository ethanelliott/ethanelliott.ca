import {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaMessage,
  OllamaTool,
  OllamaStreamChunk,
} from '../types';

const OLLAMA_URL = process.env.OLLAMA_URL || 'https://ollama.elliott.haus';
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes default
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface OllamaRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Retry helper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Don't retry on abort or client errors
      if (lastError.name === 'AbortError' || lastError.message.includes('4')) {
        throw lastError;
      }
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export class OllamaClient {
  private baseUrl: string;
  private defaultTimeoutMs: number;

  constructor(baseUrl?: string, defaultTimeoutMs?: number) {
    this.baseUrl = baseUrl || OLLAMA_URL;
    this.defaultTimeoutMs = defaultTimeoutMs || DEFAULT_TIMEOUT_MS;
  }

  /**
   * Create a combined abort signal from timeout and optional external signal
   */
  private createTimeoutSignal(
    timeoutMs: number,
    externalSignal?: AbortSignal
  ): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort('Request timeout'),
      timeoutMs
    );

    // Link external signal if provided
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', () => {
          controller.abort(externalSignal.reason);
        });
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timeoutId),
    };
  }

  /**
   * Send a chat request to Ollama (non-streaming)
   */
  async chat(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions
  ): Promise<OllamaChatResponse> {
    const { signal, cleanup } = this.createTimeoutSignal(
      options?.timeoutMs || this.defaultTimeoutMs,
      options?.signal
    );

    try {
      return await withRetry(async () => {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...request, stream: false }),
          signal,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Ollama chat failed: ${response.status} - ${error}`);
        }

        return response.json();
      });
    } finally {
      cleanup();
    }
  }

  /**
   * Send a chat request to Ollama (streaming)
   * Returns an async generator of chunks
   */
  async *chatStream(
    request: OllamaChatRequest,
    options?: OllamaRequestOptions
  ): AsyncGenerator<OllamaStreamChunk> {
    const { signal, cleanup } = this.createTimeoutSignal(
      options?.timeoutMs || this.defaultTimeoutMs * 2, // Longer timeout for streaming
      options?.signal
    );

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, stream: true }),
        signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Ollama chat stream failed: ${response.status} - ${error}`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                yield JSON.parse(line) as OllamaStreamChunk;
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            yield JSON.parse(buffer) as OllamaStreamChunk;
          } catch {
            // Skip malformed JSON
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      cleanup();
    }
  }

  /**
   * Simple completion helper for single-turn requests
   */
  async complete(
    prompt: string,
    model: string = 'llama3.1:8b',
    systemPrompt?: string
  ): Promise<string> {
    const messages: OllamaMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.chat({ model, messages });
    return response.message.content;
  }

  /**
   * Chat with tool support - handles the full tool calling loop
   */
  async chatWithTools(
    messages: OllamaMessage[],
    tools: OllamaTool[],
    model: string,
    executeToolFn: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<unknown>,
    maxIterations: number = 10
  ): Promise<{ messages: OllamaMessage[]; response: OllamaChatResponse }> {
    const conversationMessages = [...messages];
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.chat({
        model,
        messages: conversationMessages,
        tools,
      });

      conversationMessages.push(response.message);

      // If no tool calls, we're done
      if (!response.message.tool_calls?.length) {
        return { messages: conversationMessages, response };
      }

      // Execute each tool call
      for (const toolCall of response.message.tool_calls) {
        const args =
          typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;

        try {
          const result = await executeToolFn(toolCall.function.name, args);
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify(result),
          });
        } catch (error) {
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          });
        }
      }
    }

    // Max iterations reached - return last response
    const finalResponse = await this.chat({
      model,
      messages: conversationMessages,
    });

    return { messages: conversationMessages, response: finalResponse };
  }

  /**
   * List available models
   */
  async listModels(): Promise<
    { name: string; size: number; details: Record<string, unknown> }[]
  > {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }
    const data = await response.json();
    return data.models || [];
  }

  /**
   * Check if Ollama is available
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let ollamaClient: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!ollamaClient) {
    ollamaClient = new OllamaClient();
  }
  return ollamaClient;
}
