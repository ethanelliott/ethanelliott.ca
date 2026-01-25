import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getOrchestrator } from '../agents';
import { Agent, getAgentRegistry } from '../agents/agent';
import { getToolRouter } from '../agents/tool-router';
import { StreamEmitter } from '../streaming';
import { getApprovalManager } from '../approval';
import { randomUUID } from 'crypto';

// Store conversations by ID
const conversations = new Map<
  string,
  { orchestrator: ReturnType<typeof getOrchestrator> }
>();

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
   * Returns NDJSON stream where each line is a JSON object:
   * { "event": "status", "timestamp": 123, "data": { ... } }
   *
   * Event types:
   * - status: General status messages
   * - thinking: Agent is processing
   * - delegation_start/end: Sub-agent delegation
   * - tool_call_start/end: Tool executions
   * - agent_thinking/response: Sub-agent activity
   * - content: Response content (partial or final)
   * - done: Final response with full context
   * - error: Error occurred
   */
  app.post(
    '/stream',
    {
      schema: {
        body: z.object({
          message: z.string().min(1),
          conversationId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { message, conversationId } = request.body;

      // Set up NDJSON streaming headers
      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Get or create conversation
      let convId = conversationId;
      let orchestrator = getOrchestrator();

      if (convId && conversations.has(convId)) {
        orchestrator = conversations.get(convId)!.orchestrator;
      } else {
        convId = randomUUID();
        const { createOrchestrator } = await import('../agents/orchestrator');
        orchestrator = createOrchestrator(getOrchestrator().getConfig());
        conversations.set(convId, { orchestrator });
      }

      // Create stream emitter
      const emitter = new StreamEmitter();

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
        const result = await orchestrator.run(message, emitter);

        // Send final done event
        emitter.done({
          response: result.response,
          conversationId: convId,
          delegations: result.delegations,
          totalDurationMs: result.totalDurationMs,
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
        model || 'llama3.2:3b',
        systemPrompt
      );

      return {
        response,
        model: model || 'llama3.2:3b',
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
