const OLLAMA_URL = process.env.OLLAMA_URL || 'https://ollama.elliott.haus';
const DEFAULT_MODEL = 'qwen3:4b';
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}

interface OllamaChatRequest {
  model: string;
  messages: Message[];
  stream: false;
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
}
