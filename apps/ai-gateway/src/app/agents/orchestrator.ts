import {
  OrchestratorConfig,
  OrchestratorResult,
  DelegationResult,
  SubAgentDefinition,
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

    for await (const chunk of ollama.chatStream({
      model: this.config.model || 'functiongemma',
      messages,
      tools,
    })) {
      lastChunk = chunk;

      // Emit token if there's content
      if (chunk.message?.content) {
        emitter.token(chunk.message.content, 'orchestrator', undefined, false);
        content += chunk.message.content;
      }

      // Accumulate tool calls
      if (chunk.message?.tool_calls) {
        toolCalls = chunk.message.tool_calls;
      }

      // If done, emit final token event
      if (chunk.done) {
        emitter.token('', 'orchestrator', undefined, true);
      }
    }

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
    };
  }

  /**
   * Run the orchestrator with a user query
   * @param query The user's question or request
   * @param emitter Optional stream emitter for real-time updates
   */
  async run(
    query: string,
    emitter?: StreamEmitter
  ): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const delegations: DelegationResult[] = [];

    emitter?.status('Analyzing request...');

    // Build the orchestrator's system prompt
    const systemPrompt = this.buildOrchestratorPrompt();

    // Build messages
    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
      { role: 'user', content: query },
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

        // Don't stream when using tools - tool calls don't work reliably with streaming
        // The orchestrator needs tool calls to delegate, so we use non-streaming here
        const response = await ollama.chat({
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

          // Emit tokens for the final response (simulated streaming)
          if (emitter && response.message.content) {
            const words = response.message.content.split(' ');
            for (const word of words) {
              emitter.token(word + ' ', 'orchestrator', undefined, false);
            }
            emitter.token('', 'orchestrator', undefined, true);
          }

          emitter?.content(response.message.content, false);

          return {
            success: true,
            response: response.message.content,
            delegations,
            totalDurationMs: Date.now() - startTime,
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

      // Max iterations - get final response
      emitter?.status('Generating final response...');

      const finalResponse = await ollama.chat({
        model: this.config.model || 'functiongemma',
        messages: [
          ...messages,
          {
            role: 'user',
            content:
              'Please provide a final response based on all the information gathered.',
          },
        ],
      });

      this.conversationHistory.push(
        { role: 'user', content: query },
        finalResponse.message
      );

      emitter?.content(finalResponse.message.content, false);

      return {
        success: true,
        response: finalResponse.message.content,
        delegations,
        totalDurationMs: Date.now() - startTime,
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
    const agentDescriptions = Array.from(this.config.subAgents)
      .map(
        (def) =>
          `- **${def.name}**: ${
            def.description
          }\n  Capabilities: ${def.capabilities.join(', ')}`
      )
      .join('\n');

    return `You are an intelligent orchestrator that helps users by delegating tasks to specialized agents.

## Available Agents

${agentDescriptions}

## Instructions

1. Analyze the user's request to understand what they need
2. Determine which agent(s) can best help with the request
3. Use the delegate_to_agent tool to ask agents for information
4. You can delegate to multiple agents if the request spans multiple domains
5. Synthesize the agents' responses into a helpful, coherent final answer

## Guidelines

- Be concise in your delegations - ask specific questions
- If an agent returns an error, try a different approach or agent
- Always provide a final synthesized response to the user
- If no agent is suitable, explain that to the user

When you have all the information you need, provide a final response WITHOUT calling any more tools.`;
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
}

// Default orchestrator configuration
const defaultOrchestratorConfig: OrchestratorConfig = {
  name: 'main-orchestrator',
  model: 'functiongemma',
  subAgents: [
    {
      name: 'utility-assistant',
      description:
        'Handles general utilities like time, calculations, web requests, and sensitive actions requiring approval',
      capabilities: [
        'Get current time',
        'Perform calculations',
        'Fetch data from URLs',
        'Execute sensitive actions (requires user approval)',
      ],
      agent: {
        name: 'utility-assistant',
        description: 'General utility assistant',
        systemPrompt: `You are a helpful assistant with access to utility tools.
You can tell the time, perform calculations, fetch data from the web, and perform sensitive actions.
For sensitive actions, the user will be asked for approval before execution.
Be precise and accurate in your responses.`,
        model: 'functiongemma',
        tools: [
          'get_current_time',
          'calculate',
          'http_request',
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
