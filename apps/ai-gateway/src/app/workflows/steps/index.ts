import { getStepRegistry } from '../step-registry';
import { getToolRegistry } from '../../mcp';
import { getOllamaClient } from '../../ollama';
import { StepType } from '../workflow.types';

/**
 * Core workflow step types.
 *
 * Each step is deliberately small: config schema + executor. The palette
 * grows by adding entries here (or registering from other modules) — the
 * `tool_call` step already exposes every registry tool, including tools
 * from connected MCP servers.
 */

/** ─── manual_trigger ─────────────────────────────────────────────── */

const manualTrigger: StepType = {
  kind: 'manual_trigger',
  name: 'Manual trigger',
  description:
    'Entry point. Receives the payload the run was started with and passes it downstream.',
  category: 'Triggers',
  isTrigger: true,
  configSchema: { type: 'object', properties: {} },
  async execute(ctx) {
    return ctx.scope.input ?? {};
  },
};

/** ─── tool_call ──────────────────────────────────────────────────── */

const toolCall: StepType = {
  kind: 'tool_call',
  name: 'Call a tool',
  description:
    'Execute any tool from the gateway registry (built-ins and connected MCP servers). Params support {{ templates }}.',
  category: 'Actions',
  configSchema: {
    type: 'object',
    properties: {
      tool: {
        type: 'string',
        description: 'Registry tool name (e.g. get_current_weather)',
      },
      params: {
        type: 'object',
        description: 'Tool parameters; string values may use {{ templates }}',
      },
    },
    required: ['tool'],
  },
  async execute(ctx) {
    const toolName = ctx.config.tool as string;
    const params = (ctx.config.params as Record<string, unknown>) || {};

    const registry = getToolRegistry();
    const tool = registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in registry`);
    }
    if (tool.approval?.required) {
      throw new Error(
        `Tool "${toolName}" requires interactive approval and cannot run unattended in a workflow`
      );
    }

    const result = await registry.execute(toolName, params);
    if (!result.success) {
      throw new Error(result.error || `Tool "${toolName}" failed`);
    }
    return result.data ?? null;
  },
};

/** ─── llm_prompt ─────────────────────────────────────────────────── */

const llmPrompt: StepType = {
  kind: 'llm_prompt',
  name: 'LLM prompt',
  description:
    'Run a single prompt against a local model and output its text. The prompt supports {{ templates }}.',
  category: 'Actions',
  configSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The prompt to send' },
      system: {
        type: 'string',
        description: 'Optional system prompt',
      },
      model: {
        type: 'string',
        description: 'Model name (default: gemma4:e2b)',
      },
      temperature: {
        type: 'number',
        description: 'Sampling temperature (default: 0.7)',
      },
      json: {
        type: 'boolean',
        description:
          'When true, the output text is parsed as JSON (the prompt should ask for JSON)',
      },
    },
    required: ['prompt'],
  },
  async execute(ctx) {
    const prompt = ctx.config.prompt as string;
    if (!prompt?.trim()) throw new Error('Prompt is empty');

    const ollama = getOllamaClient();
    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (ctx.config.system) {
      messages.push({ role: 'system', content: ctx.config.system as string });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await ollama.chat(
      {
        model: (ctx.config.model as string) || 'gemma4:e2b',
        messages,
        options: {
          temperature: (ctx.config.temperature as number) ?? 0.7,
        },
      },
      { signal: ctx.signal }
    );

    // Strip reasoning tags some models emit inline
    const text = (response.message.content || '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();

    if (ctx.config.json === true) {
      const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error(`LLM output was not JSON: ${text.slice(0, 200)}`);
      }
      return { text, json: JSON.parse(jsonMatch[0]) };
    }

    return { text };
  },
};

/** ─── condition ──────────────────────────────────────────────────── */

const condition: StepType = {
  kind: 'condition',
  name: 'Condition',
  description:
    'Compare two values and branch. Outgoing edges marked "true"/"false" are followed based on the result.',
  category: 'Logic',
  configSchema: {
    type: 'object',
    properties: {
      left: {
        type: 'string',
        description: 'Left value (usually a {{ template }})',
      },
      operator: {
        type: 'string',
        enum: [
          'equals',
          'not_equals',
          'contains',
          'greater_than',
          'less_than',
          'exists',
          'is_truthy',
        ],
        description: 'Comparison operator',
      },
      right: {
        type: 'string',
        description: 'Right value (unused for exists/is_truthy)',
      },
    },
    required: ['left', 'operator'],
  },
  async execute(ctx) {
    const left = ctx.config.left as unknown;
    const right = ctx.config.right as unknown;
    const operator = ctx.config.operator as string;

    const asNumber = (v: unknown) =>
      typeof v === 'number' ? v : parseFloat(String(v));

    let result: boolean;
    switch (operator) {
      case 'equals':
        // Loose string comparison keeps template output ergonomics sane
        result = String(left) === String(right);
        break;
      case 'not_equals':
        result = String(left) !== String(right);
        break;
      case 'contains':
        result = String(left).includes(String(right));
        break;
      case 'greater_than':
        result = asNumber(left) > asNumber(right);
        break;
      case 'less_than':
        result = asNumber(left) < asNumber(right);
        break;
      case 'exists':
        result = left !== undefined && left !== null && left !== '';
        break;
      case 'is_truthy':
        result = Boolean(left) && String(left) !== 'false';
        break;
      default:
        throw new Error(`Unknown operator "${operator}"`);
    }

    return { result, left, right, operator };
  },
};

/** ─── transform ──────────────────────────────────────────────────── */

const transform: StepType = {
  kind: 'transform',
  name: 'Transform',
  description:
    'Shape data for downstream steps: build an object where each value is a {{ template }} against previous outputs.',
  category: 'Logic',
  configSchema: {
    type: 'object',
    properties: {
      output: {
        type: 'object',
        description:
          'The object to produce. String values support {{ templates }} — an exact "{{ path }}" keeps the raw type.',
      },
    },
    required: ['output'],
  },
  async execute(ctx) {
    // Config is already deep-rendered by the engine — just return the shape
    return ctx.config.output ?? {};
  },
};

/** ─── notify ─────────────────────────────────────────────────────── */

const notify: StepType = {
  kind: 'notify',
  name: 'Send notification',
  description:
    'Push a ntfy notification to your devices. Message and title support {{ templates }}.',
  category: 'Actions',
  configSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Notification body' },
      title: { type: 'string', description: 'Notification title' },
      priority: {
        type: 'string',
        enum: ['min', 'low', 'default', 'high', 'urgent'],
        description: 'Priority (default: default)',
      },
    },
    required: ['message'],
  },
  async execute(ctx) {
    const registry = getToolRegistry();
    const result = await registry.execute('send_notification', {
      message: ctx.config.message,
      title: ctx.config.title,
      priority: ctx.config.priority,
    });
    if (!result.success) {
      throw new Error(result.error || 'Notification failed');
    }
    return result.data ?? { sent: true };
  },
};

/** ─── registration ───────────────────────────────────────────────── */

const registry = getStepRegistry();
registry.register(manualTrigger);
registry.register(toolCall);
registry.register(llmPrompt);
registry.register(condition);
registry.register(transform);
registry.register(notify);

export { manualTrigger, toolCall, llmPrompt, condition, transform, notify };
