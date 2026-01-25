import {
  MCPService,
  MCPServiceRegistration,
  MCPTool,
  MCPToolWithExecutor,
  MCPToolResult,
} from '../types';
import { getToolRegistry, createTool } from './tool-registry';

/**
 * Service Registry
 *
 * Manages external MCP-compatible services that expose tools via /mcp endpoints.
 *
 * Expected service endpoints:
 * - GET  /mcp/tools              - List available tools
 * - POST /mcp/tools/:name/execute - Execute a tool
 */

class ServiceRegistry {
  private services: Map<string, MCPService> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Register a new MCP service
   */
  async register(registration: MCPServiceRegistration): Promise<MCPService> {
    const { name, url, description } = registration;

    // Normalize URL (remove trailing slash)
    const normalizedUrl = url.replace(/\/$/, '');

    // Check if already registered
    if (this.services.has(name)) {
      throw new Error(`Service "${name}" is already registered`);
    }

    // Create service entry
    const service: MCPService = {
      name,
      url: normalizedUrl,
      description,
      status: 'disconnected',
      tools: [],
    };

    this.services.set(name, service);

    // Try to sync tools from the service
    await this.syncService(name);

    return this.services.get(name)!;
  }

  /**
   * Unregister a service and remove its tools
   */
  async unregister(name: string): Promise<boolean> {
    const service = this.services.get(name);
    if (!service) return false;

    // Remove all tools registered by this service
    const toolRegistry = getToolRegistry();
    for (const toolName of service.tools) {
      toolRegistry.unregister(toolName);
    }

    this.services.delete(name);
    console.log(`[ServiceRegistry] Unregistered service: ${name}`);
    return true;
  }

  /**
   * Sync tools from a service's /mcp/tools endpoint
   */
  async syncService(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" not found`);
    }

    console.log(`[ServiceRegistry] Syncing tools from service: ${name}`);

    try {
      // Fetch tools from the service
      const response = await fetch(`${service.url}/mcp/tools`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Service returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const tools: MCPTool[] = data.tools || data;

      if (!Array.isArray(tools)) {
        throw new Error('Invalid response: expected tools array');
      }

      // Remove old tools from this service
      const toolRegistry = getToolRegistry();
      for (const oldToolName of service.tools) {
        toolRegistry.unregister(oldToolName);
      }

      // Register new tools
      const registeredTools: string[] = [];
      for (const tool of tools) {
        const toolWithExecutor = this.createServiceTool(service, tool);
        toolRegistry.register(toolWithExecutor);
        registeredTools.push(tool.name);
      }

      // Update service status
      service.tools = registeredTools;
      service.status = 'connected';
      service.lastSync = new Date().toISOString();
      service.error = undefined;

      console.log(
        `[ServiceRegistry] Synced ${registeredTools.length} tools from ${name}: ${registeredTools.join(', ')}`
      );
    } catch (error) {
      service.status = 'error';
      service.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ServiceRegistry] Failed to sync service ${name}:`, service.error);
      throw error;
    }
  }

  /**
   * Create a tool that proxies to the service's execute endpoint
   */
  private createServiceTool(service: MCPService, tool: MCPTool): MCPToolWithExecutor {
    return createTool(
      {
        name: tool.name,
        description: tool.description,
        category: tool.category || service.name,
        tags: [...(tool.tags || []), `service:${service.name}`],
        parameters: tool.parameters,
      },
      async (params: Record<string, unknown>): Promise<MCPToolResult> => {
        const startTime = Date.now();

        try {
          const response = await fetch(`${service.url}/mcp/tools/${tool.name}/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(params),
            signal: AbortSignal.timeout(30000),
          });

          if (!response.ok) {
            return {
              success: false,
              error: `Service returned ${response.status}: ${response.statusText}`,
              metadata: { executionTimeMs: Date.now() - startTime },
            };
          }

          const result = await response.json();

          // Handle both raw data and MCPToolResult format
          if (typeof result === 'object' && 'success' in result) {
            return {
              ...result,
              metadata: {
                ...result.metadata,
                executionTimeMs: Date.now() - startTime,
                service: service.name,
              },
            };
          }

          return {
            success: true,
            data: result,
            metadata: {
              executionTimeMs: Date.now() - startTime,
              service: service.name,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              executionTimeMs: Date.now() - startTime,
              service: service.name,
            },
          };
        }
      }
    );
  }

  /**
   * Get a service by name
   */
  get(name: string): MCPService | undefined {
    return this.services.get(name);
  }

  /**
   * Get all registered services
   */
  getAll(): MCPService[] {
    return Array.from(this.services.values());
  }

  /**
   * Sync all services
   */
  async syncAll(): Promise<void> {
    const promises = Array.from(this.services.keys()).map((name) =>
      this.syncService(name).catch((err) => {
        console.error(`[ServiceRegistry] Failed to sync ${name}:`, err);
      })
    );
    await Promise.all(promises);
  }

  /**
   * Start periodic sync (every N minutes)
   */
  startPeriodicSync(intervalMinutes: number = 5): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(
      () => {
        console.log('[ServiceRegistry] Running periodic sync...');
        this.syncAll();
      },
      intervalMinutes * 60 * 1000
    );

    console.log(`[ServiceRegistry] Started periodic sync every ${intervalMinutes} minutes`);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Check health of a service
   */
  async checkHealth(name: string): Promise<{ healthy: boolean; latencyMs: number }> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" not found`);
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${service.url}/mcp/tools`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      return {
        healthy: response.ok,
        latencyMs: Date.now() - startTime,
      };
    } catch {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
      };
    }
  }
}

// Singleton instance
const serviceRegistry = new ServiceRegistry();

export function getServiceRegistry(): ServiceRegistry {
  return serviceRegistry;
}

export async function initializeServiceRegistry(): Promise<void> {
  console.log('Initializing Service Registry...');

  // Start periodic sync (every 5 minutes)
  serviceRegistry.startPeriodicSync(5);

  // Load any pre-configured services from environment
  const preConfiguredServices = process.env.MCP_SERVICES;
  if (preConfiguredServices) {
    try {
      const services: MCPServiceRegistration[] = JSON.parse(preConfiguredServices);
      for (const service of services) {
        try {
          await serviceRegistry.register(service);
        } catch (err) {
          console.error(`[ServiceRegistry] Failed to register pre-configured service ${service.name}:`, err);
        }
      }
    } catch (err) {
      console.error('[ServiceRegistry] Failed to parse MCP_SERVICES env var:', err);
    }
  }
}
