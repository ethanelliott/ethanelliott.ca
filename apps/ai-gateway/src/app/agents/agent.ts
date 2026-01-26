import {
  AgentConfig,
  AgentResult,
  AgentToolCall,
  OllamaMessage,
  OllamaTool,
  MCPToolResult,
  ApprovalResponse,
  OllamaChatResponse,
} from '../types';
import { getOllamaClient, OllamaClient } from '../ollama';
import { getToolRegistry } from '../mcp';
import { StreamEmitter } from '../streaming';
import { getApprovalManager } from '../approval';

/**
 * Base Agent Class
 *
 * An agent is an LLM with:
 * - A system prompt defining its role
 * - Access to specific tools
 * - The ability to reason and call tools in a loop until task completion
 * - Optional streaming support for real-time token output
 */
export class Agent {
  protected config: AgentConfig;
  protected ollama: OllamaClient;
  protected conversationHistory: OllamaMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = {
      maxIterations: 10,
      temperature: 0.7,
      model: 'llama3.1:8b', // Best balance of tool calling and reasoning
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
   * Stream a chat completion, emitting tokens as they arrive
   * Returns the final response once complete
   */
  protected async streamChat(
    messages: OllamaMessage[],
    tools: OllamaTool[] | undefined,
    emitter: StreamEmitter
  ): Promise<OllamaChatResponse> {
    let content = '';
    let toolCalls: OllamaChatResponse['message']['tool_calls'] = undefined;
    let lastChunk: any = null;

    for await (const chunk of this.ollama.chatStream({
      model: this.config.model || 'functiongemma',
      messages,
      tools,
      options: {
        temperature: this.config.temperature,
      },
    })) {
      lastChunk = chunk;

      // Emit token if there's content
      if (chunk.message?.content) {
        emitter.token(chunk.message.content, 'agent', this.config.name, false);
        content += chunk.message.content;
      }

      // Accumulate tool calls
      if (chunk.message?.tool_calls) {
        toolCalls = chunk.message.tool_calls;
      }

      // If done, emit final token event
      if (chunk.done) {
        emitter.token('', 'agent', this.config.name, true);
      }
    }

    // Construct the response
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
      total_duration: lastChunk?.total_duration,
      prompt_eval_count: lastChunk?.prompt_eval_count,
      eval_count: lastChunk?.eval_count,
    };
  }

  /**
   * Run the agent with a task/prompt
   * @param task The task or question to process
   * @param emitter Optional stream emitter for real-time updates including token streaming
   */
  async run(task: string, emitter?: StreamEmitter): Promise<AgentResult> {
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

        // Emit thinking event
        emitter?.agentThinking(
          this.config.name,
          iterations,
          this.config.maxIterations || 10
        );

        // Tool calling doesn't work reliably with streaming in Ollama
        // Use non-streaming when tools are available
        const response = await this.ollama.chat({
          model: this.config.model || 'functiongemma',
          messages,
          tools: tools.length > 0 ? tools : undefined,
          options: {
            temperature: this.config.temperature,
          },
        });

        messages.push(response.message);

        // If no tool calls, we're done - stream the final response if we have content
        if (!response.message.tool_calls?.length) {
          // Save to conversation history
          this.conversationHistory.push(
            { role: 'user', content: task },
            response.message
          );

          // Emit tokens for the final response content (optimized chunking)
          if (emitter && response.message.content) {
            // Emit content in optimized chunks (sentences or ~50 char chunks)
            // This balances UX responsiveness with event overhead
            const content = response.message.content;
            const chunkSize = 50;
            let i = 0;
            while (i < content.length) {
              // Try to break at sentence boundaries or spaces
              let end = Math.min(i + chunkSize, content.length);
              if (end < content.length) {
                // Look for natural break points
                const sentenceEnd = content
                  .slice(i, end + 20)
                  .search(/[.!?]\s/);
                if (sentenceEnd > 0 && sentenceEnd < chunkSize + 20) {
                  end = i + sentenceEnd + 2;
                } else {
                  const spacePos = content.lastIndexOf(' ', end);
                  if (spacePos > i) end = spacePos + 1;
                }
              }
              emitter.token(
                content.slice(i, end),
                'agent',
                this.config.name,
                false
              );
              i = end;
            }
            emitter.token('', 'agent', this.config.name, true);
          }

          // Emit agent response (final content)
          emitter?.agentResponse(this.config.name, response.message.content);

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

          // Check if tool requires approval
          const tool = registry.get(toolName);
          let result: MCPToolResult;
          let userParams: Record<string, unknown> | undefined;

          if (tool?.approval?.required && emitter) {
            // Request approval and wait for response
            const approvalManager = getApprovalManager();

            // Emit approval required event
            emitter.approvalRequired(toolName, toolName, args, {
              message: tool.approval.message,
              userParametersSchema: tool.approval.userParametersSchema,
              agentName: this.config.name,
            });

            try {
              // Wait for approval (this will block until user responds or timeout)
              const approvalResponse = await approvalManager.requestApproval(
                toolName,
                args,
                {
                  message: tool.approval.message,
                  userParametersSchema: tool.approval.userParametersSchema,
                  agentName: this.config.name,
                }
              );

              // Emit approval received
              emitter.approvalReceived(
                approvalResponse.approvalId,
                approvalResponse.approved,
                {
                  userParameters: approvalResponse.userParameters,
                  rejectionReason: approvalResponse.rejectionReason,
                }
              );

              if (!approvalResponse.approved) {
                // User rejected - add rejection to messages and continue
                result = {
                  success: false,
                  error: `Tool execution rejected by user: ${
                    approvalResponse.rejectionReason || 'No reason provided'
                  }`,
                };
              } else {
                // Approved - execute with user parameters
                userParams = approvalResponse.userParameters;

                // Emit tool call start after approval
                emitter.toolCallStart(toolName, args, this.config.name);

                result = await registry.execute(toolName, args, userParams);
              }
            } catch (error) {
              // Approval timeout or error
              result = {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Approval request failed',
              };
            }
          } else {
            // No approval required - execute directly
            emitter?.toolCallStart(toolName, args, this.config.name);
            result = await registry.execute(toolName, args);
          }

          const toolDurationMs = Date.now() - toolStartTime;

          // Emit tool call end (only if we actually executed)
          if (result.success || !result.error?.includes('rejected by user')) {
            emitter?.toolCallEnd(
              toolName,
              args,
              result,
              toolDurationMs,
              this.config.name
            );
          }

          const agentToolCall: AgentToolCall = {
            tool: toolName,
            input: args,
            output: result,
            durationMs: toolDurationMs,
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
      emitter?.status(`Max iterations reached, generating final response...`);

      const finalResponse = await this.ollama.chat({
        model: this.config.model || 'functiongemma',
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

      emitter?.agentResponse(this.config.name, finalResponse.message.content);

      return {
        success: true,
        response: finalResponse.message.content,
        toolCalls,
        iterations,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      emitter?.error(`Agent error: ${errorMsg}`);

      return {
        success: false,
        response: '',
        error: errorMsg,
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
