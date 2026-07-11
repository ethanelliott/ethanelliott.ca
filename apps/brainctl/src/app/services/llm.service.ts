const BASE_URL = process.env['LITELLM_BASE_URL'] ?? '';
const API_KEY = process.env['LITELLM_API_KEY'] ?? 'no-key';
const DEFAULT_MODEL = process.env['LITELLM_CHAT_MODEL'] ?? 'gpt-4o-mini';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export function isLlmAvailable(): boolean {
  return Boolean(BASE_URL);
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (!BASE_URL) throw new Error('LITELLM_BASE_URL is not set');

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LiteLLM chat ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = json.choices[0]?.message?.content;
  if (!text) throw new Error('Empty response from LiteLLM');
  return text;
}
