import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getOrchestrator } from '../agents/orchestrator';
import { getAgentRegistry } from '../agents/agent';
import { getToolRegistry } from '../mcp';
import { getOllamaClient } from '../ollama';

export const ConfigRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /config
   * Get the full runtime configuration of the ai-gateway
   */
  app.get('/', async () => {
    const orchestrator = getOrchestrator();
    const config = orchestrator.getConfig();
    const toolRegistry = getToolRegistry();
    const allTools = toolRegistry.getAll();

    return {
      orchestrator: {
        name: config.name,
        model: config.model,
        maxDelegations: config.maxDelegations,
        routerModel: config.routerModel,
      },
      subAgents: config.subAgents.map((sa) => ({
        name: sa.name,
        description: sa.description,
        capabilities: sa.capabilities,
        agent: {
          name: sa.agent.name,
          description: sa.agent.description,
          model: sa.agent.model,
          systemPrompt: sa.agent.systemPrompt,
          tools: sa.agent.tools,
          maxIterations: sa.agent.maxIterations,
          temperature: sa.agent.temperature,
        },
      })),
      tools: allTools.map((t) => ({
        name: t.name,
        description: t.description,
        category: t.category,
        tags: t.tags,
        enabled: true,
      })),
      categories: toolRegistry.getCategories(),
    };
  });

  /**
   * PUT /config/orchestrator
   * Update orchestrator runtime settings
   */
  app.put(
    '/orchestrator',
    {
      schema: {
        body: z.object({
          model: z.string().optional(),
          maxDelegations: z.number().min(1).max(20).optional(),
          routerModel: z.string().optional(),
        }),
      },
    },
    async (request) => {
      const orchestrator = getOrchestrator();
      orchestrator.updateConfig(request.body);
      const config = orchestrator.getConfig();

      return {
        success: true,
        orchestrator: {
          name: config.name,
          model: config.model,
          maxDelegations: config.maxDelegations,
          routerModel: config.routerModel,
        },
      };
    }
  );

  /**
   * PUT /config/agent/:name
   * Update a sub-agent's runtime configuration
   */
  app.put(
    '/agent/:name',
    {
      schema: {
        params: z.object({
          name: z.string(),
        }),
        body: z.object({
          model: z.string().optional(),
          systemPrompt: z.string().optional(),
          tools: z.array(z.string()).optional(),
          temperature: z.number().min(0).max(2).optional(),
          maxIterations: z.number().min(1).max(50).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const orchestrator = getOrchestrator();
      const success = orchestrator.updateSubAgent(name, request.body as any);

      if (!success) {
        return reply.status(404).send({
          error: `Agent "${name}" not found`,
          availableAgents: orchestrator.getSubAgentNames(),
        });
      }

      const agentConfig = orchestrator.getSubAgentConfig(name);
      return {
        success: true,
        agent: agentConfig,
      };
    }
  );

  /**
   * GET /config/agent/:name
   * Get a sub-agent's full configuration
   */
  app.get(
    '/agent/:name',
    {
      schema: {
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const orchestrator = getOrchestrator();
      const agentConfig = orchestrator.getSubAgentConfig(name);

      if (!agentConfig) {
        return reply.status(404).send({
          error: `Agent "${name}" not found`,
          availableAgents: orchestrator.getSubAgentNames(),
        });
      }

      return agentConfig;
    }
  );

  /**
   * GET /config/models
   * Get available models from Ollama
   */
  app.get('/models', async (request, reply) => {
    const ollama = getOllamaClient();
    try {
      const models = await ollama.listModels();
      return {
        count: models.length,
        models: models.map((m) => ({
          name: m.name,
          sizeGb: Math.round((m.size / 1024 / 1024 / 1024) * 100) / 100,
          family: m.details?.family,
          parameterSize: m.details?.parameter_size,
          quantization: m.details?.quantization_level,
        })),
      };
    } catch (error) {
      return reply.status(503).send({
        error: 'Failed to connect to Ollama',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /config/tools
   * Get all tools with their status
   */
  app.get('/tools', async () => {
    const toolRegistry = getToolRegistry();
    const allTools = toolRegistry.getAll();

    return {
      count: allTools.length,
      categories: toolRegistry.getCategories(),
      tools: allTools.map((t) => ({
        name: t.name,
        description: t.description,
        category: t.category,
        tags: t.tags,
        parameters: t.parameters,
        approval: t.approval,
      })),
    };
  });

  /**
   * GET /config/health
   * Quick health check with system overview
   */
  app.get('/health', async () => {
    const ollama = getOllamaClient();
    const healthy = await ollama.isHealthy();
    const orchestrator = getOrchestrator();
    const config = orchestrator.getConfig();
    const toolRegistry = getToolRegistry();

    return {
      status: healthy ? 'healthy' : 'degraded',
      ollama: healthy ? 'connected' : 'disconnected',
      orchestratorModel: config.model,
      subAgentCount: config.subAgents.length,
      toolCount: toolRegistry.getAll().length,
    };
  });

  /**
   * POST /config/reset
   * Reset the orchestrator to default configuration
   */
  app.post('/reset', async () => {
    const orchestrator = getOrchestrator();
    orchestrator.reset();
    return { success: true, message: 'Orchestrator state reset' };
  });
};
