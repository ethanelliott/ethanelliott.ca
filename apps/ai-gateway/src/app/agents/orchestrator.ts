import {
  OrchestratorConfig,
  OrchestratorResult,
  DelegationResult,
  SubAgentDefinition,
  AgentConfig,
  AgentResult,
  OllamaMessage,
  OllamaChatResponse,
} from '../types';
import { Agent, registerAgent, getAgentRegistry } from './agent';
import { getToolRouter } from './tool-router';
import { getOllamaClient } from '../ollama';
import { getToolRegistry, createTool } from '../mcp';
import { StreamEmitter } from '../streaming';

/**
 * Orchestrator Agent
 *
 * The main coordinating agent that:
 * 1. Analyzes user requests
 * 2. Decides whether to handle directly or delegate to sub-agents
 * 3. Synthesizes results from sub-agents into a coherent response
 *
 * Sub-agents are specialized agents with specific capabilities and tools.
 */
export class OrchestratorAgent {
  private config: OrchestratorConfig;
  private subAgents: Map<string, Agent> = new Map();
  private conversationHistory: OllamaMessage[] = [];

  constructor(config: OrchestratorConfig) {
    this.config = {
      maxDelegations: 5,
      model: 'functiongemma',
      ...config,
    };

    // Create and register sub-agents
    for (const subAgentDef of config.subAgents) {
      const agent = new Agent(subAgentDef.agent);
      this.subAgents.set(subAgentDef.name, agent);
      registerAgent(agent);
    }
  }

  /**
   * Reset conversation history
   */
  reset(): void {
    this.conversationHistory = [];
    // Reset all sub-agents too
    for (const agent of this.subAgents.values()) {
      agent.reset();
    }
  }

  /**
   * Add a message to conversation history (for stateless API)
   */
  addToHistory(message: OllamaMessage): void {
    this.conversationHistory.push(message);
  }

  /**
   * Stream a chat completion from the orchestrator, emitting tokens
   */
  private async streamOrchestratorChat(
    messages: OllamaMessage[],
    tools: {
      type: 'function';
      function: { name: string; description: string; parameters: any };
    }[],
    emitter: StreamEmitter
  ): Promise<OllamaChatResponse> {
    const ollama = getOllamaClient();
    let content = '';
    let toolCalls: OllamaChatResponse['message']['tool_calls'] = undefined;
    let lastChunk: any = null;
    const streamStart = Date.now();
    let firstContentTokenTime: number | undefined;
    let thinkingStart: number | undefined;
    let thinkingEnd: number | undefined;
    let thinkingTokenCount = 0;

    for await (const chunk of ollama.chatStream({
      model: this.config.model || 'functiongemma',
      messages,
      tools,
    })) {
      lastChunk = chunk;

      // Ollama surfaces thinking in a dedicated field
      if (chunk.message?.thinking) {
        if (!thinkingStart) thinkingStart = Date.now();
        thinkingEnd = Date.now();
        thinkingTokenCount++;
        emitter.thinkingToken(chunk.message.thinking, 'orchestrator');
      }

      // Regular content tokens
      if (chunk.message?.content) {
        if (!firstContentTokenTime) firstContentTokenTime = Date.now();
        content += chunk.message.content;
        emitter.token(chunk.message.content, 'orchestrator', undefined, false);
      }

      // Accumulate tool calls
      if (chunk.message?.tool_calls) {
        toolCalls = chunk.message.tool_calls;
      }

      // Emit final token on done
      if (chunk.done) {
        emitter.token('', 'orchestrator', undefined, true);
      }
    }

    // Calculate stats from the final chunk
    const evalCount = lastChunk?.eval_count;
    const evalDuration = lastChunk?.eval_duration; // nanoseconds
    const promptEvalCount = lastChunk?.prompt_eval_count;
    const tokensPerSecond =
      evalCount && evalDuration ? evalCount / (evalDuration / 1e9) : undefined;
    const reasoningDurationMs =
      thinkingStart && thinkingEnd ? thinkingEnd - thinkingStart : undefined;
    const timeToFirstTokenMs = firstContentTokenTime
      ? firstContentTokenTime - streamStart
      : undefined;

    const stats = {
      model: lastChunk?.model || this.config.model,
      totalTokens: (promptEvalCount || 0) + (evalCount || 0) || undefined,
      promptTokens: promptEvalCount,
      completionTokens: evalCount,
      tokensPerSecond: tokensPerSecond
        ? Math.round(tokensPerSecond * 10) / 10
        : undefined,
      reasoningTokens: thinkingTokenCount || undefined,
      reasoningDurationMs,
      timeToFirstTokenMs,
      totalDurationMs: lastChunk?.total_duration
        ? Math.round(lastChunk.total_duration / 1e6)
        : undefined,
    };

    return {
      model: lastChunk?.model || this.config.model || 'functiongemma',
      created_at: lastChunk?.created_at || new Date().toISOString(),
      message: {
        role: 'assistant',
        content,
        tool_calls: toolCalls,
      },
      done: true,
      done_reason: toolCalls?.length ? 'tool_calls' : 'stop',
      // Attach stats to response for propagation
      _stats: stats,
    } as any;
  }

  /**
   * Run the orchestrator with a user query
   * @param query The user's question or request
   * @param emitter Optional stream emitter for real-time updates
   * @param images Optional base64-encoded images for vision models
   */
  async run(
    query: string,
    emitter?: StreamEmitter,
    images?: string[]
  ): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const delegations: DelegationResult[] = [];

    emitter?.status('Analyzing request...');

    // Build the orchestrator's system prompt
    const systemPrompt = this.buildOrchestratorPrompt();

    // Build messages
    const userMessage: OllamaMessage = { role: 'user', content: query };
    if (images?.length) {
      userMessage.images = images;
    }
    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
      userMessage,
    ];

    // Create the delegation tool with emitter support
    const delegateTool = this.createDelegationTool(delegations, emitter);
    const registry = getToolRegistry();

    // Temporarily register the delegation tool
    registry.register(delegateTool);

    try {
      const ollama = getOllamaClient();

      let iterations = 0;
      const maxIterations = (this.config.maxDelegations || 5) + 2;

      const delegateTools = [
        {
          type: 'function' as const,
          function: {
            name: delegateTool.name,
            description: delegateTool.description,
            parameters: delegateTool.parameters,
          },
        },
      ];

      while (iterations < maxIterations) {
        iterations++;

        emitter?.thinking(
          `Orchestrator thinking (iteration ${iterations}/${maxIterations})...`
        );

        // Use streaming when we have an emitter so tokens arrive in real-time
        // streamOrchestratorChat handles both text and tool_call responses
        const response = emitter
          ? await this.streamOrchestratorChat(messages, delegateTools, emitter)
          : await ollama.chat({
              model: this.config.model || 'functiongemma',
              messages,
              tools: delegateTools,
            });

        messages.push(response.message);

        // If no tool calls, we're done
        if (!response.message.tool_calls?.length) {
          // Save to conversation history
          this.conversationHistory.push(
            { role: 'user', content: query },
            response.message
          );

          return {
            success: true,
            response: response.message.content,
            delegations,
            totalDurationMs: Date.now() - startTime,
            stats: (response as any)?._stats,
          };
        }

        // Check if we've hit max delegations
        if (delegations.length >= (this.config.maxDelegations || 5)) {
          emitter?.status(
            'Maximum delegations reached, generating final response...'
          );
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              error:
                'Maximum delegations reached. Please provide a final response.',
            }),
          });
          continue;
        }

        // Execute delegation
        for (const toolCall of response.message.tool_calls) {
          if (toolCall.function.name === 'delegate_to_agent') {
            const args =
              typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;

            const result = await delegateTool.execute(args);

            messages.push({
              role: 'tool',
              content: JSON.stringify(result.data || result),
            });
          }
        }
      }

      // Max iterations - get final response with streaming
      emitter?.status('Generating final response...');

      const finalMessages = [
        ...messages,
        {
          role: 'user' as const,
          content:
            'Please provide a final response based on all the information gathered.',
        },
      ];

      const finalResponse = emitter
        ? await this.streamOrchestratorChat(finalMessages, [], emitter)
        : await ollama.chat({
            model: this.config.model || 'functiongemma',
            messages: finalMessages,
          });

      this.conversationHistory.push(
        { role: 'user', content: query },
        finalResponse.message
      );

      return {
        success: true,
        response: finalResponse.message.content,
        delegations,
        totalDurationMs: Date.now() - startTime,
        stats: (finalResponse as any)?._stats,
      };
    } finally {
      // Clean up the delegation tool
      registry.unregister(delegateTool.name);
    }
  }

  /**
   * Build the orchestrator's system prompt
   */
  private buildOrchestratorPrompt(): string {
    if (this.config.systemPrompt) {
      return this.config.systemPrompt;
    }

    const agentDescriptions = Array.from(this.config.subAgents)
      .map(
        (def) =>
          `- **${def.name}**: ${
            def.description
          }\n  Capabilities: ${def.capabilities.join(', ')}`
      )
      .join('\n');

    return `You are a helpful AI assistant with access to specialized agents that you can delegate tasks to.

## Available Agents

${agentDescriptions}

## Instructions

- If the user's request would benefit from a specialized agent's capabilities or tools (e.g. fetching live data, running calculations, searching the web, accessing external services), delegate to the appropriate agent using the delegate_to_agent tool.
- If the user's message is simple and conversational (e.g. greetings, general knowledge questions, opinions, or anything you can answer well on your own), respond directly without delegating.
- When delegating, choose the most appropriate agent based on the task and provide a clear, specific description of what the agent should do.
- You may delegate to multiple agents in sequence if a request involves multiple distinct tasks.

## Examples

- User: "What time is it?" → Delegate (you don't have access to a clock, but an agent with tools might)
- User: "Hello, how are you?" → Respond directly (simple greeting, no tools needed)
- User: "What's the capital of France?" → Respond directly (general knowledge)
- User: "Search for the latest news about AI" → Delegate (requires web access)
- User: "Summarize this text for me: ..." → Respond directly (you can do this yourself)

Use your best judgment. When in doubt about whether an agent would add value, go ahead and delegate.`;
  }

  /**
   * Create the delegation tool
   */
  private createDelegationTool(
    delegations: DelegationResult[],
    emitter?: StreamEmitter
  ) {
    const agentNames = Array.from(this.subAgents.keys());

    return createTool(
      {
        name: 'delegate_to_agent',
        description: 'Delegate a task to a specialized agent',
        category: 'Orchestrator',
        parameters: {
          type: 'object',
          properties: {
            agent_name: {
              type: 'string',
              description: `The agent to delegate to. Available: ${agentNames.join(
                ', '
              )}`,
              enum: agentNames,
            },
            task: {
              type: 'string',
              description: 'A clear, specific task or question for the agent',
            },
          },
          required: ['agent_name', 'task'],
        },
      },
      async (params) => {
        const agentName = params.agent_name as string;
        const task = params.task as string;

        const agent = this.subAgents.get(agentName);
        if (!agent) {
          return {
            success: false,
            error: `Agent "${agentName}" not found`,
          };
        }

        console.log(`[Orchestrator] Delegating to ${agentName}: "${task}"`);
        emitter?.delegationStart(agentName, task);

        // Run the sub-agent with the same emitter for full visibility
        const delegationStart = Date.now();
        const result = await agent.run(task, emitter);
        const delegationDuration = Date.now() - delegationStart;

        emitter?.delegationEnd(
          agentName,
          task,
          delegationDuration,
          result.response
        );

        const delegation: DelegationResult = {
          agentName,
          task,
          result,
        };
        delegations.push(delegation);

        return {
          success: true,
          data: {
            agent: agentName,
            response: result.response,
            toolsUsed: result.toolCalls?.map((tc) => tc.tool) || [],
          },
        };
      }
    );
  }

  /**
   * Get configuration
   */
  getConfig(): OrchestratorConfig {
    return this.config;
  }

  /**
   * Update orchestrator configuration at runtime
   */
  updateConfig(
    updates: Partial<
      Pick<
        OrchestratorConfig,
        'model' | 'maxDelegations' | 'routerModel' | 'systemPrompt'
      >
    >
  ): void {
    if (updates.model !== undefined) this.config.model = updates.model;
    if (updates.maxDelegations !== undefined)
      this.config.maxDelegations = updates.maxDelegations;
    if (updates.routerModel !== undefined)
      this.config.routerModel = updates.routerModel;
    if (updates.systemPrompt !== undefined)
      this.config.systemPrompt = updates.systemPrompt;
  }

  /**
   * Update a sub-agent's configuration
   */
  updateSubAgent(name: string, updates: Partial<AgentConfig>): boolean {
    const agent = this.subAgents.get(name);
    if (!agent) return false;
    agent.updateConfig(updates);
    // Also update the config definition
    const def = this.config.subAgents.find((sa) => sa.name === name);
    if (def) {
      def.agent = { ...def.agent, ...updates };
    }
    return true;
  }

  /**
   * Get sub-agent names
   */
  getSubAgentNames(): string[] {
    return Array.from(this.subAgents.keys());
  }

  /**
   * Get a sub-agent's config
   */
  getSubAgentConfig(name: string): AgentConfig | null {
    const agent = this.subAgents.get(name);
    return agent ? agent.getConfig() : null;
  }
}

// Default orchestrator configuration
export const defaultOrchestratorConfig: OrchestratorConfig = {
  name: 'main-orchestrator',
  model: 'qwen3:4b', // Best for complex reasoning and correct tool calling
  subAgents: [
    {
      name: 'utility-assistant',
      description:
        'Handles general utilities like time, calculations, web requests, user questions, and sensitive actions requiring approval',
      capabilities: [
        'Get current time',
        'Perform calculations',
        'Fetch data from URLs',
        'Ask the user questions for clarification or preferences',
        'Execute sensitive actions (requires user approval)',
      ],
      agent: {
        name: 'utility-assistant',
        description: 'General utility assistant',
        systemPrompt: `You are an assistant that MUST use tools to answer questions.

Available tools:
- get_current_time: Use this for ANY time-related question
- calculate: Use this for ANY math calculation. ALWAYS use numeric values, not variable names.
- http_request: Use this to fetch data from URLs
- ask_user: Use this to ask the user one or more questions. Supports multiple questions in a single call (wizard-style). Provide multiple-choice options when possible.
- sensitive_action: Use this for actions requiring approval

ALWAYS use the appropriate tool. NEVER answer without using a tool first.
When using calculate, break down complex problems into the correct mathematical expression with actual numbers.
When using ask_user, provide a questions array. Each question should have a clear question text and 2-6 helpful options when applicable. You can ask multiple questions at once.

Examples:
- "What time is it?" → use get_current_time
- "Calculate 5+5" → use calculate with expression="5+5"
- "4 apples at $2 with 10% discount" → use calculate with expression="(4 * 2) * 0.9"
- User says "plan a trip" but you need to know where → use ask_user with questions array containing destination, budget, and duration questions`,
        model: 'qwen3:4b', // Best for reasoning-heavy tool use
        tools: [
          'get_current_time',
          'calculate',
          'http_request',
          'ask_user',
          'sensitive_action',
        ],
      },
    },
  ],
  maxDelegations: 5,
};

// Create the default orchestrator
let orchestrator: OrchestratorAgent | null = null;

export function getOrchestrator(): OrchestratorAgent {
  if (!orchestrator) {
    orchestrator = new OrchestratorAgent(defaultOrchestratorConfig);
  }
  return orchestrator;
}

export function createOrchestrator(
  config: OrchestratorConfig
): OrchestratorAgent {
  return new OrchestratorAgent(config);
}
