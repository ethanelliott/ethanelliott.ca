import {
  MCPService,
  MCPServiceRegistration,
  MCPTool,
  MCPToolWithExecutor,
  MCPToolResult,
  ServiceProtocol,
} from '../types';
import { getToolRegistry, createTool } from './tool-registry';
import { MCPClient, MCPRemoteTool } from './mcp-client';

/**
 * Service Registry
 *
 * Manages external tool servers connected to the gateway. Two protocols are
 * supported:
 *
 * - 'mcp'  — real Model Context Protocol servers (Streamable HTTP transport).
 *            Point at the server's MCP endpoint (e.g. https://host/mcp).
 * - 'http' — the gateway's simple REST protocol:
 *              GET  /mcp/tools               → { tools: MCPTool[] }
 *              POST /mcp/tools/:name/execute → result
 *
 * When no protocol is specified at registration, MCP is tried first and the
 * simple protocol is used as a fallback.
 *
 * Tools from external services are registered under a namespaced name
 * (`<service>__<tool>`) so they can never collide with built-ins or with
 * tools from other services.
 */

function namespacedName(service: string, tool: string): string {
  return `${service}__${tool}`;
}

class ServiceRegistry {
  private services: Map<string, MCPService> = new Map();
  private mcpClients: Map<string, MCPClient> = new Map();
  private headersByService: Map<string, Record<string, string>> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Register a new external service (auto-detects protocol when omitted)
   */
  async register(registration: MCPServiceRegistration): Promise<MCPService> {
    const { name, url, description, headers } = registration;

    // Normalize URL (remove trailing slash)
    const normalizedUrl = url.replace(/\/$/, '');

    if (this.services.has(name)) {
      throw new Error(`Service "${name}" is already registered`);
    }

    if (headers) this.headersByService.set(name, headers);

    const protocol =
      registration.protocol ??
      (await this.detectProtocol(normalizedUrl, headers || {}));

    const service: MCPService = {
      name,
      url: normalizedUrl,
      protocol,
      description,
      status: 'disconnected',
      tools: [],
    };

    this.services.set(name, service);

    try {
      await this.syncService(name);
    } catch (error) {
      // Keep the registration so the user can see the error and retry sync,
      // but surface the failure to the caller
      throw error;
    }

    return this.services.get(name)!;
  }

  /**
   * Probe a URL to figure out which protocol it speaks.
   * MCP is tried first (initialize handshake), then the simple HTTP protocol.
   */
  private async detectProtocol(
    url: string,
    headers: Record<string, string>
  ): Promise<ServiceProtocol> {
    const client = new MCPClient(url, headers);
    try {
      await client.initialize();
      return 'mcp';
    } catch {
      // Not an MCP endpoint — check the simple protocol
    }

    try {
      const response = await fetch(`${url}/mcp/tools`, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return 'http';
    } catch {
      // fall through
    }

    throw new Error(
      'Could not detect protocol: URL is neither an MCP endpoint (JSON-RPC initialize failed) ' +
        'nor a simple HTTP tool service (GET /mcp/tools failed)'
    );
  }

  /**
   * Unregister a service and remove its tools
   */
  async unregister(name: string): Promise<boolean> {
    const service = this.services.get(name);
    if (!service) return false;

    const toolRegistry = getToolRegistry();
    for (const toolName of service.tools) {
      toolRegistry.unregister(toolName);
    }

    this.services.delete(name);
    this.mcpClients.delete(name);
    this.headersByService.delete(name);
    console.log(`[ServiceRegistry] Unregistered service: ${name}`);
    return true;
  }

  /**
   * Sync tools from a service (protocol-aware)
   */
  async syncService(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" not found`);
    }

    console.log(
      `[ServiceRegistry] Syncing tools from ${service.protocol} service: ${name}`
    );

    try {
      const registered =
        service.protocol === 'mcp'
          ? await this.syncMcpService(service)
          : await this.syncHttpService(service);

      service.tools = registered;
      service.status = 'connected';
      service.lastSync = new Date().toISOString();
      service.error = undefined;

      console.log(
        `[ServiceRegistry] Synced ${registered.length} tools from ${name}: ${registered.join(', ')}`
      );
    } catch (error) {
      service.status = 'error';
      service.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[ServiceRegistry] Failed to sync service ${name}:`,
        service.error
      );
      throw error;
    }
  }

  /** Sync a real MCP server via the MCP client */
  private async syncMcpService(service: MCPService): Promise<string[]> {
    const client = this.getMcpClient(service);
    client.reset(); // fresh handshake picks up server restarts

    const serverInfo = await client.initialize();
    if (serverInfo.serverName) {
      service.serverInfo = [serverInfo.serverName, serverInfo.version]
        .filter(Boolean)
        .join(' ');
    }

    const remoteTools = await client.listTools();

    // Replace previously registered tools
    const toolRegistry = getToolRegistry();
    for (const oldToolName of service.tools) {
      toolRegistry.unregister(oldToolName);
    }

    const registered: string[] = [];
    for (const tool of remoteTools) {
      const toolWithExecutor = this.createMcpTool(service, tool);
      toolRegistry.register(toolWithExecutor);
      registered.push(toolWithExecutor.name);
    }
    return registered;
  }

  /** Sync a simple-protocol service via GET /mcp/tools */
  private async syncHttpService(service: MCPService): Promise<string[]> {
    const headers = this.headersByService.get(service.name) || {};
    const response = await fetch(`${service.url}/mcp/tools`, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(
        `Service returned ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();
    const tools: MCPTool[] = data.tools || data;

    if (!Array.isArray(tools)) {
      throw new Error('Invalid response: expected tools array');
    }

    const toolRegistry = getToolRegistry();
    for (const oldToolName of service.tools) {
      toolRegistry.unregister(oldToolName);
    }

    const registered: string[] = [];
    for (const tool of tools) {
      const toolWithExecutor = this.createHttpTool(service, tool);
      toolRegistry.register(toolWithExecutor);
      registered.push(toolWithExecutor.name);
    }
    return registered;
  }

  private getMcpClient(service: MCPService): MCPClient {
    let client = this.mcpClients.get(service.name);
    if (!client) {
      client = new MCPClient(
        service.url,
        this.headersByService.get(service.name) || {}
      );
      this.mcpClients.set(service.name, client);
    }
    return client;
  }

  /** Wrap a remote MCP tool as a locally-registered executor */
  private createMcpTool(
    service: MCPService,
    tool: MCPRemoteTool
  ): MCPToolWithExecutor {
    return createTool(
      {
        name: namespacedName(service.name, tool.name),
        description: tool.description || `${tool.name} (via ${service.name})`,
        category: service.name,
        tags: [`mcp:${service.name}`, 'external'],
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      },
      async (params: Record<string, unknown>): Promise<MCPToolResult> => {
        const startTime = Date.now();
        try {
          const client = this.getMcpClient(service);
          const result = await client.callTool(tool.name, params);
          return {
            success: !result.isError,
            data: result.data,
            error: result.isError ? result.text || 'Tool failed' : undefined,
            metadata: {
              executionTimeMs: Date.now() - startTime,
              service: service.name,
              protocol: 'mcp',
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              executionTimeMs: Date.now() - startTime,
              service: service.name,
              protocol: 'mcp',
            },
          };
        }
      }
    );
  }

  /** Wrap a simple-protocol tool as a locally-registered executor */
  private createHttpTool(
    service: MCPService,
    tool: MCPTool
  ): MCPToolWithExecutor {
    const headers = this.headersByService.get(service.name) || {};
    return createTool(
      {
        name: namespacedName(service.name, tool.name),
        description: tool.description,
        category: tool.category || service.name,
        tags: [...(tool.tags || []), `service:${service.name}`, 'external'],
        parameters: tool.parameters,
      },
      async (params: Record<string, unknown>): Promise<MCPToolResult> => {
        const startTime = Date.now();

        try {
          const response = await fetch(
            `${service.url}/mcp/tools/${tool.name}/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...headers,
              },
              body: JSON.stringify(params),
              signal: AbortSignal.timeout(30000),
            }
          );

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
   * All namespaced tool names contributed by connected external services
   */
  getExternalToolNames(): string[] {
    const names: string[] = [];
    for (const service of this.services.values()) {
      if (service.status === 'connected') {
        names.push(...service.tools);
      }
    }
    return names;
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

    this.syncInterval = setInterval(() => {
      if (this.services.size === 0) return;
      console.log('[ServiceRegistry] Running periodic sync...');
      this.syncAll();
    }, intervalMinutes * 60 * 1000);

    console.log(
      `[ServiceRegistry] Started periodic sync every ${intervalMinutes} minutes`
    );
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
   * Check health of a service (protocol-aware)
   */
  async checkHealth(
    name: string
  ): Promise<{ healthy: boolean; latencyMs: number }> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service "${name}" not found`);
    }

    const startTime = Date.now();

    try {
      if (service.protocol === 'mcp') {
        // A fresh client handshake is the most honest health signal
        const probe = new MCPClient(
          service.url,
          this.headersByService.get(name) || {}
        );
        await probe.initialize();
        return { healthy: true, latencyMs: Date.now() - startTime };
      }

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
      const services: MCPServiceRegistration[] = JSON.parse(
        preConfiguredServices
      );
      for (const service of services) {
        try {
          await serviceRegistry.register(service);
        } catch (err) {
          console.error(
            `[ServiceRegistry] Failed to register pre-configured service ${service.name}:`,
            err
          );
        }
      }
    } catch (err) {
      console.error(
        '[ServiceRegistry] Failed to parse MCP_SERVICES env var:',
        err
      );
    }
  }
}
