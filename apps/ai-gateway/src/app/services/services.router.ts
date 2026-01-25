import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getServiceRegistry } from '../mcp/service-registry';

const ServiceRegistrationSchema = z.object({
  name: z.string().min(1).max(50),
  url: z.string().url(),
  description: z.string().optional(),
});

export const ServicesRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /services
   * List all registered MCP services
   */
  app.get('/', async () => {
    const registry = getServiceRegistry();
    const services = registry.getAll();

    return {
      count: services.length,
      services: services.map((s) => ({
        name: s.name,
        url: s.url,
        description: s.description,
        status: s.status,
        toolCount: s.tools.length,
        tools: s.tools,
        lastSync: s.lastSync,
        error: s.error,
      })),
    };
  });

  /**
   * POST /services
   * Register a new MCP service
   */
  app.post(
    '/',
    {
      schema: {
        body: ServiceRegistrationSchema,
      },
    },
    async (request, reply) => {
      const { name, url, description } = request.body;
      const registry = getServiceRegistry();

      try {
        const service = await registry.register({ name, url, description });

        return {
          success: true,
          message: `Service "${name}" registered successfully`,
          service: {
            name: service.name,
            url: service.url,
            status: service.status,
            toolCount: service.tools.length,
            tools: service.tools,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('already registered')) {
          return reply.status(409).send({
            success: false,
            error: message,
          });
        }

        return reply.status(400).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * GET /services/:name
   * Get details of a specific service
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
      const registry = getServiceRegistry();
      const service = registry.get(name);

      if (!service) {
        return reply.status(404).send({
          error: `Service "${name}" not found`,
        });
      }

      return {
        name: service.name,
        url: service.url,
        description: service.description,
        status: service.status,
        tools: service.tools,
        lastSync: service.lastSync,
        error: service.error,
      };
    }
  );

  /**
   * DELETE /services/:name
   * Unregister a service
   */
  app.delete(
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
      const registry = getServiceRegistry();

      const success = await registry.unregister(name);

      if (!success) {
        return reply.status(404).send({
          error: `Service "${name}" not found`,
        });
      }

      return {
        success: true,
        message: `Service "${name}" unregistered`,
      };
    }
  );

  /**
   * POST /services/:name/sync
   * Force sync tools from a service
   */
  app.post(
    '/:name/sync',
    {
      schema: {
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const registry = getServiceRegistry();

      const service = registry.get(name);
      if (!service) {
        return reply.status(404).send({
          error: `Service "${name}" not found`,
        });
      }

      try {
        await registry.syncService(name);
        const updated = registry.get(name)!;

        return {
          success: true,
          message: `Synced ${updated.tools.length} tools from "${name}"`,
          tools: updated.tools,
          lastSync: updated.lastSync,
        };
      } catch (error) {
        return reply.status(502).send({
          success: false,
          error: `Failed to sync: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        });
      }
    }
  );

  /**
   * GET /services/:name/health
   * Check health of a service
   */
  app.get(
    '/:name/health',
    {
      schema: {
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const registry = getServiceRegistry();

      try {
        const health = await registry.checkHealth(name);
        return {
          service: name,
          ...health,
        };
      } catch (error) {
        return reply.status(404).send({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /services/sync-all
   * Force sync all services
   */
  app.post('/sync-all', async () => {
    const registry = getServiceRegistry();
    await registry.syncAll();

    const services = registry.getAll();
    return {
      success: true,
      message: `Synced ${services.length} services`,
      services: services.map((s) => ({
        name: s.name,
        status: s.status,
        toolCount: s.tools.length,
        error: s.error,
      })),
    };
  });
};
