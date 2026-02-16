import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ChatRouter } from './chat/chat.router';
import { ToolsRouter } from './tools/tools.router';
import { AgentsRouter } from './agents/agents.router';
import { ServicesRouter } from './services/services.router';
import { MetricsRouter } from './metrics/metrics.router';
import { initializeToolRegistry } from './mcp/tool-registry';
import { initializeAgents } from './agents';

// Initialize MCP tools and agents on startup
import './mcp/tools';

export async function Application(fastify: FastifyInstance) {
  // Initialize the tool registry with built-in tools
  await initializeToolRegistry();

  // Initialize the agent system
  await initializeAgents();

  // Register routes
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(ChatRouter, { prefix: '/chat' });
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(ToolsRouter, { prefix: '/tools' });
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(AgentsRouter, { prefix: '/agents' });
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(ServicesRouter, { prefix: '/services' });
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .register(MetricsRouter, { prefix: '/app-metrics' });
}
