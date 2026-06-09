const BASE_URL = process.env['LITELLM_BASE_URL'] ?? '';
const API_KEY = process.env['LITELLM_API_KEY'] ?? 'no-key';
const MODEL = process.env['LITELLM_EMBEDDING_MODEL'] ?? 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = parseInt(process.env['LITELLM_EMBEDDING_DIMENSIONS'] ?? '1536', 10);

let _available: boolean | null = null;

export function isEmbeddingAvailable(): boolean {
  return Boolean(BASE_URL);
}

export async function embed(text: string): Promise<Float32Array | null> {
  if (!BASE_URL) return null;

  try {
    const res = await fetch(`${BASE_URL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input: text }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LiteLLM ${res.status}: ${body}`);
    }

    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    const vec = json.data[0]?.embedding;
    if (!vec?.length) throw new Error('Empty embedding returned');

    return new Float32Array(vec);
  } catch (err) {
    // Log and degrade gracefully — callers skip vector storage on null
    console.warn('[embeddings] failed:', (err as Error).message);
    return null;
  }
}

export async function embedBatch(texts: string[]): Promise<Array<Float32Array | null>> {
  if (!BASE_URL || !texts.length) return texts.map(() => null);

  try {
    const res = await fetch(`${BASE_URL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input: texts }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LiteLLM ${res.status}: ${body}`);
    }

    const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    const results: Array<Float32Array | null> = new Array(texts.length).fill(null);

    for (const item of json.data) {
      if (item.embedding?.length) {
        results[item.index] = new Float32Array(item.embedding);
      }
    }

    return results;
  } catch (err) {
    console.warn('[embeddings] batch failed:', (err as Error).message);
    return texts.map(() => null);
  }
}

export function serializeVec(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer);
}
