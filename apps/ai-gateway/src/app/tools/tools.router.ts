import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getToolRegistry, createTool } from '../mcp';
import { MCPToolWithExecutor } from '../types';

// Schema for tool definition in API requests
const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional(),
  }),
  // For dynamic tools, we can provide an HTTP endpoint to call
  endpoint: z
    .object({
      url: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST'),
      headers: z.record(z.string()).optional(),
    })
    .optional(),
});

export const ToolsRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /tools
   * List all registered tools
   */
  app.get('/', async (request, reply) => {
    const registry = getToolRegistry();
    const tools = registry.getAll();

    return {
      count: tools.length,
      categories: registry.getCategories(),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        category: t.category,
        tags: t.tags,
        parameters: t.parameters,
      })),
    };
  });

  /**
   * GET /tools/:name
   * Get details of a specific tool
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
      const registry = getToolRegistry();
      const tool = registry.get(name);

      if (!tool) {
        return reply.status(404).send({
          error: `Tool "${name}" not found`,
        });
      }

      return {
        name: tool.name,
        description: tool.description,
        category: tool.category,
        tags: tool.tags,
        parameters: tool.parameters,
      };
    }
  );

  /**
   * POST /tools/:name/execute
   * Execute a tool directly
   */
  app.post(
    '/:name/execute',
    {
      schema: {
        params: z.object({
          name: z.string(),
        }),
        body: z.record(z.any()),
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const params = request.body;
      const registry = getToolRegistry();

      const result = await registry.execute(name, params);

      if (!result.success && result.error?.includes('not found')) {
        return reply.status(404).send(result);
      }

      return result;
    }
  );

  /**
   * POST /tools/register
   * Dynamically register a new tool
   *
   * Tools registered via this endpoint can either:
   * 1. Call an external HTTP endpoint
   * 2. Be "virtual" tools that just store their definition (for clients to handle)
   */
  app.post(
    '/register',
    {
      schema: {
        body: ToolDefinitionSchema,
      },
    },
    async (request, reply) => {
      const toolDef = request.body;
      const registry = getToolRegistry();

      // Check if tool already exists
      if (registry.get(toolDef.name)) {
        return reply.status(409).send({
          error: `Tool "${toolDef.name}" already exists. Use PUT to update.`,
        });
      }

      // Create the tool with an executor
      let executor: MCPToolWithExecutor['execute'];

      if (toolDef.endpoint) {
        // Create an HTTP-based executor
        const { url, method, headers } = toolDef.endpoint;
        executor = async (params) => {
          try {
            const response = await fetch(url, {
              method,
              headers: {
                'Content-Type': 'application/json',
                ...headers,
              },
              body: method !== 'GET' ? JSON.stringify(params) : undefined,
              signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
              return {
                success: false,
                error: `External endpoint returned ${response.status}`,
              };
            }

            const data = await response.json();
            return {
              success: true,
              data,
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        };
      } else {
        // Virtual tool - returns its own parameters back
        executor = async (params) => {
          return {
            success: true,
            data: {
              message: `Virtual tool "${toolDef.name}" called`,
              params,
            },
          };
        };
      }

      const tool = createTool(
        {
          name: toolDef.name,
          description: toolDef.description,
          category: toolDef.category,
          tags: toolDef.tags,
          parameters: toolDef.parameters,
        },
        executor
      );

      registry.register(tool);

      return {
        success: true,
        message: `Tool "${toolDef.name}" registered`,
        tool: {
          name: tool.name,
          description: tool.description,
          category: tool.category,
        },
      };
    }
  );

  /**
   * DELETE /tools/:name
   * Unregister a tool
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
      const registry = getToolRegistry();

      // Don't allow deleting built-in tools
      const builtInTools = [
        'get_current_time',
        'calculate',
        'http_request',
        'search_recipes',
        'get_recipe_details',
        'list_recipe_categories',
        'get_grocery_list',
        'add_to_grocery_list',
      ];

      if (builtInTools.includes(name)) {
        return reply.status(403).send({
          error: `Cannot delete built-in tool "${name}"`,
        });
      }

      const success = registry.unregister(name);

      if (!success) {
        return reply.status(404).send({
          error: `Tool "${name}" not found`,
        });
      }

      return {
        success: true,
        message: `Tool "${name}" unregistered`,
      };
    }
  );

  /**
   * GET /tools/categories
   * List all tool categories
   */
  app.get('/categories', async (request, reply) => {
    const registry = getToolRegistry();
    return {
      categories: registry.getCategories(),
    };
  });

  /**
   * GET /tools/category/:category
   * List tools in a specific category
   */
  app.get(
    '/category/:category',
    {
      schema: {
        params: z.object({
          category: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { category } = request.params;
      const registry = getToolRegistry();
      const tools = registry.getByCategory(category);

      return {
        category,
        count: tools.length,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          tags: t.tags,
        })),
      };
    }
  );
};
