import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getAgentRegistry } from '../agents/agent';
import { getOrchestrator } from '../agents/orchestrator';
import { getOllamaClient } from '../ollama';

export const AgentsRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /agents
   * List all registered agents
   */
  app.get('/', async (request, reply) => {
    const registry = getAgentRegistry();
    const agents = registry.getAllConfigs();

    return {
      count: agents.length,
      agents: agents.map((a) => ({
        name: a.name,
        description: a.description,
        model: a.model,
        tools: a.tools,
      })),
    };
  });

  /**
   * GET /agents/:name
   * Get details of a specific agent
   */
  app.get(
    '/:name',
    {
      schema: {
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const registry = getAgentRegistry();
      const agent = registry.get(name);

      if (!agent) {
        return reply.status(404).send({
          error: `Agent "${name}" not found`,
          availableAgents: registry.getAllConfigs().map((c) => c.name),
        });
      }

      const config = agent.getConfig();

      return {
        name: config.name,
        description: config.description,
        model: config.model,
        tools: config.tools,
        systemPrompt: config.systemPrompt,
        maxIterations: config.maxIterations,
        temperature: config.temperature,
      };
    }
  );

  /**
   * GET /agents/orchestrator
   * Get orchestrator configuration
   */
  app.get('/orchestrator/config', async (request, reply) => {
    const orchestrator = getOrchestrator();
    const config = orchestrator.getConfig();

    return {
      name: config.name,
      model: config.model,
      maxDelegations: config.maxDelegations,
      subAgents: config.subAgents.map((sa) => ({
        name: sa.name,
        description: sa.description,
        capabilities: sa.capabilities,
        model: sa.agent.model,
        tools: sa.agent.tools,
      })),
    };
  });

  /**
   * GET /agents/models
   * List available Ollama models
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
          details: m.details,
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
   * GET /agents/health
   * Check if Ollama is available
   */
  app.get('/health', async (request, reply) => {
    const ollama = getOllamaClient();
    const healthy = await ollama.isHealthy();

    return {
      ollama: healthy ? 'connected' : 'disconnected',
      status: healthy ? 'healthy' : 'unhealthy',
    };
  });
};
