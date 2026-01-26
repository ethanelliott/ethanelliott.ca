import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getOrchestrator } from '../agents';
import { Agent, getAgentRegistry } from '../agents/agent';
import { getToolRouter } from '../agents/tool-router';
import { StreamEmitter } from '../streaming';
import { getApprovalManager } from '../approval';
import { randomUUID } from 'crypto';
import { OllamaMessage, DelegationResult } from '../types';

/**
 * LRU Cache with TTL for conversation management
 * Prevents unbounded memory growth in long-running servers
 */
class ConversationCache<T> {
  private cache = new Map<string, { value: T; lastAccess: number }>();
  private maxSize: number;
  private ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxSize = 1000, ttlMs = 30 * 60 * 1000) {
    // 30 min default TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.startCleanup();
  }

  private startCleanup() {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => this.evictExpired(), 60000);
  }

  private evictExpired() {
    const now = Date.now();
    const expired: string[] = [];
    for (const [key, entry] of this.cache) {
      if (now - entry.lastAccess > this.ttlMs) {
        expired.push(key);
      }
    }
    for (const key of expired) {
      this.cache.delete(key);
    }
    if (expired.length > 0) {
      console.log(
        `[ConversationCache] Evicted ${expired.length} expired conversations`
      );
    }
  }

  private evictLRU() {
    if (this.cache.size <= this.maxSize) return;

    // Find and remove oldest entries
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess
    );

    const toRemove = entries.slice(0, this.cache.size - this.maxSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
    console.log(
      `[ConversationCache] Evicted ${toRemove.length} LRU conversations`
    );
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, lastAccess: Date.now() });
    this.evictLRU();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Store conversations with LRU + TTL (max 1000 conversations, 30 min TTL)
const conversations = new ConversationCache<{
  orchestrator: ReturnType<typeof getOrchestrator>;
}>(1000, 30 * 60 * 1000);

// Tool call structure (matches Ollama's format)
const ToolCallSchema = z.object({
  id: z.string().optional(),
  function: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()),
  }),
});

// Tool result structure
const ToolResultSchema = z.object({
  tool_call_id: z.string().optional(),
  name: z.string(),
  result: z.unknown(),
});

// Message schema - matches Ollama's native format for proper context
// This allows the LLM to understand tool call history natively
const MessageSchema = z.discriminatedUnion('role', [
  // User message
  z.object({
    role: z.literal('user'),
    content: z.string(),
  }),
  // Assistant message (may include tool calls)
  z.object({
    role: z.literal('assistant'),
    content: z.string(),
    tool_calls: z.array(ToolCallSchema).optional(),
  }),
  // Tool result message
  z.object({
    role: z.literal('tool'),
    content: z.string(),
    tool_call_id: z.string().optional(),
    name: z.string().optional(), // Tool name for display
  }),
]);

// Type for messages
type ChatMessage = z.infer<typeof MessageSchema>;

// Session configuration schema
const SessionConfigSchema = z.object({
  enabledTools: z.array(z.string()).optional(), // If provided, only these tools are available
  disabledTools: z.array(z.string()).optional(), // If provided, these tools are disabled
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

// Request/Response schemas
const ChatRequestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  useRouter: z.boolean().optional().default(true),
  model: z.string().optional(),
});

const ChatResponseSchema = z.object({
  response: z.string(),
  conversationId: z.string(),
  delegations: z
    .array(
      z.object({
        agentName: z.string(),
        task: z.string(),
        response: z.string(),
        toolsUsed: z.array(z.string()),
        durationMs: z.number(),
      })
    )
    .optional(),
  durationMs: z.number(),
});

const DirectAgentRequestSchema = z.object({
  message: z.string().min(1),
  agentName: z.string(),
});

export const ChatRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /chat
   * Main chat endpoint that uses the orchestrator
   */
  app.post(
    '/',
    {
      schema: {
        body: ChatRequestSchema,
        response: {
          200: ChatResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { message, conversationId, useRouter } = request.body;

      // Get or create conversation
      let convId = conversationId;
      let orchestrator = getOrchestrator();

      if (convId && conversations.has(convId)) {
        orchestrator = conversations.get(convId)!.orchestrator;
      } else {
        convId = randomUUID();
        // Create a new orchestrator instance for this conversation
        const { createOrchestrator } = await import('../agents/orchestrator');
        orchestrator = createOrchestrator(getOrchestrator().getConfig());
        conversations.set(convId, { orchestrator });
      }

      // Optionally use the tool router for efficient tool selection
      if (useRouter) {
        const router = getToolRouter();
        const selectedTools = await router.selectToolsByKeywords(message);
        console.log(
          `[Chat] Router selected tools: ${selectedTools.join(', ')}`
        );
      }

      // Run the orchestrator
      const result = await orchestrator.run(message);

      return {
        response: result.response,
        conversationId: convId,
        delegations: result.delegations.map((d) => ({
          agentName: d.agentName,
          task: d.task,
          response: d.result.response,
          toolsUsed: d.result.toolCalls?.map((tc) => tc.tool) || [],
          durationMs: d.result.totalDurationMs,
        })),
        durationMs: result.totalDurationMs,
      };
    }
  );

  /**
   * POST /chat/stream
   * Streaming chat endpoint with real-time status updates via newline-delimited JSON (NDJSON)
   *
   * This is the recommended endpoint for building UIs:
   * - Stateless: send full message history, no server-side conversation state
   * - Supports tool enable/disable configuration
   * - Returns updated message history in the done event
   *
   * Returns NDJSON stream where each line is a JSON object:
   * { "event": "status", "timestamp": 123, "data": { ... } }
   *
   * Event types:
   * - status: General status messages
   * - thinking: Agent is processing
   * - token: Real-time LLM output tokens
   * - delegation_start/end: Sub-agent delegation
   * - tool_call_start/end: Tool executions
   * - agent_thinking/response: Sub-agent activity
   * - approval_required/received: Human-in-the-loop approval
   * - content: Response content (partial or final)
   * - done: Final response with full context including updated messages
   * - error: Error occurred
   */
  app.post(
    '/stream',
    {
      schema: {
        body: z.object({
          messages: z.array(MessageSchema).min(1),
          config: SessionConfigSchema.optional(),
        }),
      },
    },
    async (request, reply) => {
      const { messages, config } = request.body;

      // Set up NDJSON streaming headers
      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Create a fresh orchestrator for this request (stateless)
      const { createOrchestrator, defaultOrchestratorConfig } = await import(
        '../agents/orchestrator'
      );

      // Apply configuration
      let orchestratorConfig = { ...defaultOrchestratorConfig };
      if (config?.model) {
        orchestratorConfig.model = config.model;
      }

      // Filter tools based on config
      const { getToolRegistry } = await import('../mcp');
      const toolRegistry = getToolRegistry();
      const allTools = toolRegistry.getAll().map((t) => t.name);

      let enabledTools = allTools;
      if (config?.enabledTools) {
        enabledTools = config.enabledTools.filter((t) => allTools.includes(t));
      }
      if (config?.disabledTools) {
        enabledTools = enabledTools.filter(
          (t) => !config.disabledTools!.includes(t)
        );
      }

      // Update sub-agent tools based on filtered list
      orchestratorConfig = {
        ...orchestratorConfig,
        subAgents: orchestratorConfig.subAgents.map(
          (sa: (typeof orchestratorConfig.subAgents)[0]) => ({
            ...sa,
            agent: {
              ...sa.agent,
              tools: sa.agent.tools?.filter((t: string) =>
                enabledTools.includes(t)
              ),
            },
          })
        ),
      };

      const orchestrator = createOrchestrator(orchestratorConfig);

      // Inject conversation history from messages (skip last user message)
      // Messages use Ollama's native format, so they can be passed directly
      const historyMessages = messages.slice(0, -1);
      for (const msg of historyMessages) {
        // Convert to OllamaMessage format
        if (msg.role === 'user' || msg.role === 'assistant') {
          orchestrator.addToHistory({
            role: msg.role,
            content: msg.content,
            tool_calls:
              msg.role === 'assistant' && 'tool_calls' in msg
                ? msg.tool_calls
                : undefined,
          });
        } else if (msg.role === 'tool') {
          // Tool result messages - the model will see these as tool responses
          orchestrator.addToHistory({
            role: 'tool',
            content: msg.content,
          });
        }
      }

      // Get the last user message
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== 'user') {
        reply.raw.write(
          JSON.stringify({
            event: 'error',
            timestamp: Date.now(),
            data: { error: 'Last message must be from user' },
          }) + '\n'
        );
        reply.raw.end();
        return;
      }

      // Create stream emitter
      const emitter = new StreamEmitter();

      // Send session info first
      emitter.status(
        `Session started with ${enabledTools.length} tools enabled`
      );

      // Send events to client as NDJSON (one JSON object per line)
      const unsubscribe = emitter.on((event) => {
        const line = JSON.stringify({
          event: event.type,
          timestamp: event.timestamp,
          data: event.data,
        });
        reply.raw.write(line + '\n');
      });

      try {
        // Run the orchestrator with streaming
        const result = await orchestrator.run(lastMessage.content, emitter);

        // Build the response messages in Ollama's native format
        // This includes tool calls and tool results so the model can reference them
        const newMessages: ChatMessage[] = [];

        // If there were delegations with tool calls, emit them as proper tool messages
        for (const delegation of result.delegations) {
          // Emit an assistant message with the delegation as a "tool call"
          // This represents "the assistant decided to use this tool"
          const toolCalls =
            delegation.result.toolCalls?.map((tc, idx) => ({
              id: `${delegation.agentName}-${idx}`,
              function: {
                name: tc.tool,
                arguments: tc.input,
              },
            })) ?? [];

          if (toolCalls.length > 0) {
            newMessages.push({
              role: 'assistant' as const,
              content: '', // Empty when making tool calls
              tool_calls: toolCalls,
            });

            // Emit tool results for each tool call
            for (const tc of delegation.result.toolCalls ?? []) {
              newMessages.push({
                role: 'tool' as const,
                content: JSON.stringify(tc.output),
                name: tc.tool,
              });
            }
          }
        }

        // Final assistant response
        newMessages.push({
          role: 'assistant' as const,
          content: result.response,
        });

        // Build complete updated history
        const updatedHistory: ChatMessage[] = [...messages, ...newMessages];

        // Send final done event with messages
        emitter.emit('done', {
          response: result.response,
          messages: updatedHistory,
          delegations: result.delegations,
          totalDurationMs: result.totalDurationMs,
          enabledTools,
        });
      } catch (error) {
        emitter.error(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        unsubscribe();
        reply.raw.end();
      }
    }
  );

  /**
   * POST /chat/stateless
   * @deprecated Use /chat/stream instead - this is an alias for backwards compatibility
   */
  app.post(
    '/stateless',
    {
      schema: {
        body: z.object({
          messages: z.array(MessageSchema).min(1),
          config: SessionConfigSchema.optional(),
        }),
      },
    },
    async (request, reply) => {
      // Send deprecation warning header
      reply.header('X-Deprecated', 'Use /chat/stream instead');

      // HTTP redirect for client to follow (307 preserves POST method)
      return reply.code(307).redirect('/chat/stream');
    }
  );

  /**
   * POST /chat/agent
   * Direct chat with a specific agent (bypasses orchestrator)
   */
  app.post(
    '/agent',
    {
      schema: {
        body: DirectAgentRequestSchema,
      },
    },
    async (request, reply) => {
      const { message, agentName } = request.body;

      const registry = getAgentRegistry();
      const agent = registry.get(agentName);

      if (!agent) {
        return reply.status(404).send({
          error: `Agent "${agentName}" not found`,
          availableAgents: registry.getAllConfigs().map((c) => c.name),
        });
      }

      const result = await agent.run(message);

      return {
        response: result.response,
        toolCalls: result.toolCalls?.map((tc) => ({
          tool: tc.tool,
          input: tc.input,
          success: tc.output.success,
          durationMs: tc.durationMs,
        })),
        iterations: result.iterations,
        durationMs: result.totalDurationMs,
      };
    }
  );

  /**
   * POST /chat/simple
   * Simple completion without agents (direct to Ollama)
   */
  app.post(
    '/simple',
    {
      schema: {
        body: z.object({
          message: z.string().min(1),
          model: z.string().optional(),
          systemPrompt: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { message, model, systemPrompt } = request.body;
      const { getOllamaClient } = await import('../ollama');
      const ollama = getOllamaClient();

      const startTime = Date.now();
      const response = await ollama.complete(
        message,
        model || 'functiongemma',
        systemPrompt
      );

      return {
        response,
        model: model || 'llama3.1:8b',
        durationMs: Date.now() - startTime,
      };
    }
  );

  /**
   * DELETE /chat/:conversationId
   * End a conversation and clean up
   */
  app.delete(
    '/:conversationId',
    {
      schema: {
        params: z.object({
          conversationId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { conversationId } = request.params;

      if (conversations.has(conversationId)) {
        conversations.delete(conversationId);
        return { success: true, message: 'Conversation ended' };
      }

      return reply.status(404).send({
        error: 'Conversation not found',
      });
    }
  );

  /**
   * POST /chat/reset
   * Reset the default orchestrator's conversation history
   */
  app.post('/reset', async (request, reply) => {
    getOrchestrator().reset();
    return { success: true, message: 'Orchestrator reset' };
  });

  /**
   * POST /chat/approve
   * Submit an approval decision for a pending tool execution
   *
   * Used in human-in-the-loop workflows when a tool requires user approval
   * before execution.
   */
  app.post(
    '/approve',
    {
      schema: {
        body: z.object({
          approvalId: z.string().uuid(),
          approved: z.boolean(),
          userParameters: z.record(z.unknown()).optional(),
          rejectionReason: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { approvalId, approved, userParameters, rejectionReason } =
        request.body;

      const approvalManager = getApprovalManager();

      // Check if approval exists
      if (!approvalManager.hasPendingApproval(approvalId)) {
        return reply.status(404).send({
          error: 'Approval request not found or already processed',
          approvalId,
        });
      }

      // Submit the approval
      const success = approvalManager.submitApproval({
        approvalId,
        approved,
        userParameters,
        rejectionReason,
      });

      if (!success) {
        return reply.status(500).send({
          error: 'Failed to process approval',
          approvalId,
        });
      }

      return {
        success: true,
        message: approved
          ? 'Tool execution approved'
          : 'Tool execution rejected',
        approvalId,
      };
    }
  );

  /**
   * GET /chat/approvals
   * List all pending approval requests
   */
  app.get('/approvals', async () => {
    const approvalManager = getApprovalManager();
    const pending = approvalManager.getPendingApprovals();

    return {
      count: pending.length,
      approvals: pending,
    };
  });

  /**
   * DELETE /chat/approvals/:approvalId
   * Cancel a pending approval request
   */
  app.delete(
    '/approvals/:approvalId',
    {
      schema: {
        params: z.object({
          approvalId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { approvalId } = request.params;
      const approvalManager = getApprovalManager();

      const success = approvalManager.cancelApproval(
        approvalId,
        'Cancelled by user'
      );

      if (!success) {
        return reply.status(404).send({
          error: 'Approval request not found',
          approvalId,
        });
      }

      return {
        success: true,
        message: 'Approval request cancelled',
        approvalId,
      };
    }
  );
};
