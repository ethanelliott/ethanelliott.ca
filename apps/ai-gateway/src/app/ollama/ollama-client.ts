import {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaMessage,
  OllamaTool,
  OllamaStreamChunk,
} from '../types';

const OLLAMA_URL = process.env.OLLAMA_URL || 'https://ollama.elliott.haus';

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || OLLAMA_URL;
  }

  /**
   * Send a chat request to Ollama (non-streaming)
   */
  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: false }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama chat failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Send a chat request to Ollama (streaming)
   * Returns an async generator of chunks
   */
  async *chatStream(
    request: OllamaChatRequest
  ): AsyncGenerator<OllamaStreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: true }),
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
  }

  /**
   * Simple completion helper for single-turn requests
   */
  async complete(
    prompt: string,
    model: string = 'functiongemma',
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
