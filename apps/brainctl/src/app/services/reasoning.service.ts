import { chat, ChatOptions } from './llm.service.js';
import { searchMemories, Memory } from './memory.service.js';
import { getDb } from '../db/database.js';

export interface ReasonInput {
  query: string;
  context_limit?: number;
  agent_id?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  memory_types?: string[];
}

export interface ReasonResult {
  answer: string;
  grounding: Memory[];
  model: string;
  tokens_used?: number;
}

export interface InferInput {
  premise: string;
  context?: string[];
  depth?: 'shallow' | 'deep';
  agent_id?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface InferResult {
  conclusions: string[];
  reasoning: string;
  grounding: Memory[];
  model: string;
}

export interface DreamInput {
  topic?: string;
  memory_limit?: number;
  min_confidence?: number;
  agent_id?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface DreamResult {
  hypotheses: string[];
  synthesis: string;
  source_memories: Memory[];
  model: string;
}

// ---------------------------------------------------------------------------
// reason — grounded Q&A: retrieve relevant memories, feed as context to LLM
// ---------------------------------------------------------------------------

export async function reason(input: ReasonInput): Promise<ReasonResult> {
  const agentId = input.agent_id ?? 'default';
  const contextLimit = input.context_limit ?? 8;
  const model = input.model ?? process.env['LITELLM_CHAT_MODEL'] ?? 'gpt-4o-mini';

  const grounding = await searchMemories({ query: input.query, limit: contextLimit, agent_id: agentId });

  const memoryBlock = grounding.length
    ? grounding.map((m, i) => `[${i + 1}] (${m.memory_type}, conf=${m.confidence.toFixed(2)}) ${m.content}`).join('\n')
    : '(no relevant memories found)';

  const answer = await chat([
    {
      role: 'system',
      content: `You are a reasoning assistant with access to an agent's memory store.
Answer the user's question using ONLY the provided memory context.
Cite memories by number [1], [2] etc. when you use them.
If the memories are insufficient, say so clearly rather than guessing.`,
    },
    {
      role: 'user',
      content: `Memory context:\n${memoryBlock}\n\nQuestion: ${input.query}`,
    },
  ], { model, temperature: input.temperature ?? 0.2, max_tokens: input.max_tokens });

  return { answer, grounding, model };
}

// ---------------------------------------------------------------------------
// infer — draw conclusions from a premise + retrieved supporting facts
// ---------------------------------------------------------------------------

export async function infer(input: InferInput): Promise<InferResult> {
  const agentId = input.agent_id ?? 'default';
  const model = input.model ?? process.env['LITELLM_CHAT_MODEL'] ?? 'gpt-4o-mini';
  const depth = input.depth ?? 'shallow';

  const grounding = await searchMemories({ query: input.premise, limit: 6, agent_id: agentId });

  const memoryBlock = grounding.length
    ? grounding.map((m, i) => `[${i + 1}] ${m.content}`).join('\n')
    : '(none)';

  const extraContext = input.context?.length
    ? `\nAdditional context provided:\n${input.context.map((c, i) => `- ${c}`).join('\n')}`
    : '';

  const depthInstruction = depth === 'deep'
    ? 'Reason through multiple inferential steps, considering second-order implications.'
    : 'Identify the most direct, well-supported conclusions only.';

  const raw = await chat([
    {
      role: 'system',
      content: `You are an inference engine. Given a premise and memory context, produce structured conclusions.
${depthInstruction}
Respond in this exact JSON format:
{
  "conclusions": ["conclusion 1", "conclusion 2", ...],
  "reasoning": "step-by-step explanation"
}`,
    },
    {
      role: 'user',
      content: `Premise: ${input.premise}${extraContext}\n\nMemory context:\n${memoryBlock}`,
    },
  ], { model, temperature: input.temperature ?? 0.1, max_tokens: input.max_tokens ?? 512 });

  let conclusions: string[] = [];
  let reasoning = '';

  try {
    const parsed = JSON.parse(extractJson(raw));
    conclusions = Array.isArray(parsed.conclusions) ? parsed.conclusions : [];
    reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : raw;
  } catch {
    conclusions = [raw.trim()];
    reasoning = raw;
  }

  return { conclusions, reasoning, grounding, model };
}

// ---------------------------------------------------------------------------
// dream — synthesise hypotheses from recent high-confidence memories
// ---------------------------------------------------------------------------

export async function dream(input: DreamInput): Promise<DreamResult> {
  const agentId = input.agent_id ?? 'default';
  const model = input.model ?? process.env['LITELLM_CHAT_MODEL'] ?? 'gpt-4o-mini';
  const minConf = input.min_confidence ?? 0.6;
  const limit = input.memory_limit ?? 20;
  const db = getDb();

  // Pull recent high-confidence memories, optionally filtered by topic
  let sourceMemories: Memory[];
  if (input.topic) {
    sourceMemories = await searchMemories({ query: input.topic, limit, agent_id: agentId });
    sourceMemories = sourceMemories.filter((m) => m.confidence >= minConf);
  } else {
    sourceMemories = db.prepare(`
      SELECT * FROM memories
      WHERE agent_id = @agent_id
        AND retired_at IS NULL
        AND confidence >= @min_conf
      ORDER BY last_accessed_at DESC NULLS LAST, confidence DESC
      LIMIT @limit
    `).all({ agent_id: agentId, min_conf: minConf, limit }) as Memory[];
  }

  if (!sourceMemories.length) {
    return { hypotheses: [], synthesis: 'No memories available for synthesis.', source_memories: [], model };
  }

  const memBlock = sourceMemories
    .map((m, i) => `[${i + 1}] (${m.category}) ${m.content}`)
    .join('\n');

  const topicLine = input.topic ? `Topic focus: ${input.topic}\n` : '';

  const raw = await chat([
    {
      role: 'system',
      content: `You are performing a memory consolidation dream cycle.
Review the provided memories and synthesise emergent patterns, hypotheses,
and insights that are NOT explicitly stated but are implied by the evidence.
${topicLine}Respond in this exact JSON format:
{
  "hypotheses": ["hypothesis 1", "hypothesis 2", ...],
  "synthesis": "a paragraph-length narrative synthesis of the patterns observed"
}`,
    },
    {
      role: 'user',
      content: `Memories to synthesise:\n${memBlock}`,
    },
  ], { model, temperature: input.temperature ?? 0.7, max_tokens: input.max_tokens ?? 1024 });

  let hypotheses: string[] = [];
  let synthesis = '';

  try {
    const parsed = JSON.parse(extractJson(raw));
    hypotheses = Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [];
    synthesis = typeof parsed.synthesis === 'string' ? parsed.synthesis : raw;
  } catch {
    hypotheses = [];
    synthesis = raw;
  }

  return { hypotheses, synthesis, source_memories: sourceMemories, model };
}

// ---------------------------------------------------------------------------
// infer_pretask — pre-task briefing: what does the agent know about this task?
// ---------------------------------------------------------------------------

export async function inferPretask(input: ReasonInput): Promise<ReasonResult> {
  const agentId = input.agent_id ?? 'default';
  const contextLimit = input.context_limit ?? 10;
  const model = input.model ?? process.env['LITELLM_CHAT_MODEL'] ?? 'gpt-4o-mini';

  const grounding = await searchMemories({ query: input.query, limit: contextLimit, agent_id: agentId });

  const memoryBlock = grounding.length
    ? grounding.map((m, i) => `[${i + 1}] (${m.memory_type}, conf=${m.confidence.toFixed(2)}) ${m.content}`).join('\n')
    : '(no relevant memories found)';

  const answer = await chat([
    {
      role: 'system',
      content: `You are preparing an agent to begin a task.
Review the memory context and produce a concise pre-task brief covering:
1. What is already known that is relevant
2. Known constraints or risks to be aware of
3. Suggested starting approach based on past experience
Be concise and actionable.`,
    },
    {
      role: 'user',
      content: `Task description: ${input.query}\n\nRelevant memories:\n${memoryBlock}`,
    },
  ], { model, temperature: input.temperature ?? 0.2, max_tokens: input.max_tokens });

  return { answer, grounding, model };
}

// ---------------------------------------------------------------------------
// infer_gapfill — what's missing? identify knowledge gaps for a topic
// ---------------------------------------------------------------------------

export async function inferGapfill(input: ReasonInput): Promise<{
  known: string[]; gaps: string[]; questions: string[]; grounding: Memory[]; model: string;
}> {
  const agentId = input.agent_id ?? 'default';
  const contextLimit = input.context_limit ?? 8;
  const model = input.model ?? process.env['LITELLM_CHAT_MODEL'] ?? 'gpt-4o-mini';

  const grounding = await searchMemories({ query: input.query, limit: contextLimit, agent_id: agentId });

  const memoryBlock = grounding.length
    ? grounding.map((m, i) => `[${i + 1}] ${m.content}`).join('\n')
    : '(no relevant memories found)';

  const raw = await chat([
    {
      role: 'system',
      content: `You are a knowledge gap analyser.
Given a topic and the agent's current memory context, identify what is known,
what is missing, and what questions should be answered to fill the gaps.
Respond in this exact JSON format:
{
  "known": ["known fact 1", ...],
  "gaps": ["missing knowledge 1", ...],
  "questions": ["question to answer 1", ...]
}`,
    },
    {
      role: 'user',
      content: `Topic: ${input.query}\n\nCurrent memory context:\n${memoryBlock}`,
    },
  ], { model, temperature: input.temperature ?? 0.2, max_tokens: input.max_tokens ?? 768 });

  let known: string[] = [];
  let gaps: string[] = [];
  let questions: string[] = [];

  try {
    const parsed = JSON.parse(extractJson(raw));
    known = Array.isArray(parsed.known) ? parsed.known : [];
    gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
    questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  } catch {
    gaps = [raw];
  }

  return { known, gaps, questions, grounding, model };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
