import {
  AgentConfig,
  AgentResult,
  AgentToolCall,
  OllamaMessage,
  MCPToolResult,
} from '../types';
import { getOllamaClient, OllamaClient } from '../ollama';
import { getToolRegistry } from '../mcp';

/**
 * Base Agent Class
 *
 * An agent is an LLM with:
 * - A system prompt defining its role
 * - Access to specific tools
 * - The ability to reason and call tools in a loop until task completion
 */
export class Agent {
  protected config: AgentConfig;
  protected ollama: OllamaClient;
  protected conversationHistory: OllamaMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = {
      maxIterations: 10,
      temperature: 0.7,
      model: 'llama3.2:3b',
      ...config,
    };
    this.ollama = getOllamaClient();
  }

  /**
   * Get the agent's configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Reset conversation history
   */
  reset(): void {
    this.conversationHistory = [];
  }

  /**
   * Run the agent with a task/prompt
   */
  async run(task: string): Promise<AgentResult> {
    const startTime = Date.now();
    const toolCalls: AgentToolCall[] = [];
    let iterations = 0;

    // Build messages
    const messages: OllamaMessage[] = [
      { role: 'system', content: this.buildSystemPrompt() },
      ...this.conversationHistory,
      { role: 'user', content: task },
    ];

    const registry = getToolRegistry();
    const tools = registry.toOllamaTools(this.config.tools);

    try {
      while (iterations < (this.config.maxIterations || 10)) {
        iterations++;

        const response = await this.ollama.chat({
          model: this.config.model || 'llama3.2:3b',
          messages,
          tools: tools.length > 0 ? tools : undefined,
          options: {
            temperature: this.config.temperature,
          },
        });

        messages.push(response.message);

        // If no tool calls, we're done
        if (!response.message.tool_calls?.length) {
          // Save to conversation history
          this.conversationHistory.push(
            { role: 'user', content: task },
            response.message
          );

          return {
            success: true,
            response: response.message.content,
            toolCalls,
            iterations,
            totalDurationMs: Date.now() - startTime,
          };
        }

        // Execute tool calls
        for (const toolCall of response.message.tool_calls) {
          const toolStartTime = Date.now();
          const toolName = toolCall.function.name;
          const args =
            typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;

          console.log(`[${this.config.name}] Calling tool: ${toolName}`, args);

          const result = await registry.execute(toolName, args);

          const agentToolCall: AgentToolCall = {
            tool: toolName,
            input: args,
            output: result,
            durationMs: Date.now() - toolStartTime,
          };
          toolCalls.push(agentToolCall);

          // Add tool result to messages
          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
          });
        }
      }

      // Max iterations reached - get final response without tools
      const finalResponse = await this.ollama.chat({
        model: this.config.model || 'llama3.2:3b',
        messages: [
          ...messages,
          {
            role: 'user',
            content:
              'Please provide a final summary response based on the information gathered.',
          },
        ],
      });

      this.conversationHistory.push(
        { role: 'user', content: task },
        finalResponse.message
      );

      return {
        success: true,
        response: finalResponse.message.content,
        toolCalls,
        iterations,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        response: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        toolCalls,
        iterations,
        totalDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build the system prompt with tool information
   */
  protected buildSystemPrompt(): string {
    const registry = getToolRegistry();
    const toolsSummary = this.config.tools
      ? registry.getToolsSummary(this.config.tools)
      : '';

    let prompt = this.config.systemPrompt;

    if (toolsSummary && this.config.tools?.length) {
      prompt += `\n\n${toolsSummary}`;
      prompt += `\n\nWhen you need to use a tool, call it using the tool_calls feature. Always use tools when they would help answer the user's question.`;
    }

    return prompt;
  }
}

/**
 * Agent Registry - keeps track of all registered agents
 */
class AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  register(agent: Agent): void {
    const config = agent.getConfig();
    this.agents.set(config.name, agent);
    console.log(`Registered agent: ${config.name}`);
  }

  get(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAllConfigs(): AgentConfig[] {
    return this.getAll().map((a) => a.getConfig());
  }
}

const agentRegistry = new AgentRegistry();

export function getAgentRegistry(): AgentRegistry {
  return agentRegistry;
}

export function registerAgent(agent: Agent): void {
  agentRegistry.register(agent);
}
