import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getMetricsCollector } from '../metrics';
import { getApprovalManager } from '../approval';
import { getOllamaClient } from '../ollama';
import { getToolRegistry } from '../mcp';
import { getServiceRegistry } from '../mcp/service-registry';

export const MetricsRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Register external metric providers on startup
  const metrics = getMetricsCollector();
  metrics.registerExternalMetrics({
    getPendingApprovals: () => getApprovalManager().getPendingCount(),
  });

  /**
   * GET /metrics
   * Get comprehensive metrics snapshot
   */
  app.get('/', async () => {
    return getMetricsCollector().getSnapshot();
  });

  /**
   * GET /metrics/health
   * Health check with detailed status
   */
  app.get('/health', async () => {
    const ollama = getOllamaClient();
    const ollamaHealthy = await ollama.isHealthy();
    const registry = getToolRegistry();
    const serviceRegistry = getServiceRegistry();
    const services = serviceRegistry.getAll();

    const serviceHealth = services.map((s) => ({
      name: s.name,
      status: s.status,
      toolCount: s.tools.length,
    }));

    const overallHealthy = ollamaHealthy;

    return {
      status: overallHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        ollama: {
          status: ollamaHealthy ? 'connected' : 'disconnected',
        },
        tools: {
          count: registry.getAll().length,
          categories: registry.getCategories().length,
        },
        services: {
          count: services.length,
          details: serviceHealth,
        },
        approvals: {
          pending: getApprovalManager().getPendingCount(),
          metrics: getApprovalManager().getMetrics(),
        },
      },
    };
  });

  /**
   * GET /metrics/tools
   * Get tool-specific metrics
   */
  app.get('/tools', async () => {
    const snapshot = getMetricsCollector().getSnapshot();
    return {
      tools: snapshot.tools,
      summary: {
        totalTools: Object.keys(snapshot.tools).length,
        totalCalls: Object.values(snapshot.tools).reduce(
          (sum, t) => sum + t.totalCalls,
          0
        ),
        totalErrors: Object.values(snapshot.tools).reduce(
          (sum, t) => sum + t.failedCalls,
          0
        ),
      },
    };
  });

  /**
   * GET /metrics/llm
   * Get LLM-specific metrics
   */
  app.get('/llm', async () => {
    const snapshot = getMetricsCollector().getSnapshot();
    return {
      models: snapshot.llm,
      summary: {
        totalModels: Object.keys(snapshot.llm).length,
        totalRequests: Object.values(snapshot.llm).reduce(
          (sum, m) => sum + m.totalRequests,
          0
        ),
        totalTokens: Object.values(snapshot.llm).reduce(
          (sum, m) => sum + m.totalTokensPrompt + m.totalTokensCompletion,
          0
        ),
      },
    };
  });

  /**
   * POST /metrics/reset
   * Reset all metrics (for testing/debugging)
   */
  app.post('/reset', async () => {
    getMetricsCollector().reset();
    return { success: true, message: 'Metrics reset' };
  });
};
