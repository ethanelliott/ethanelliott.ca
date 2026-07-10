import { MCPToolSchema } from '../types';

/**
 * Minimal Model Context Protocol client (Streamable HTTP transport).
 *
 * Speaks JSON-RPC 2.0 over a single HTTP endpoint per the MCP spec:
 * - initialize / notifications/initialized handshake with version negotiation
 * - tools/list (with cursor pagination)
 * - tools/call
 *
 * Handles both plain JSON responses and SSE-wrapped responses (a Streamable
 * HTTP server may answer any POST with text/event-stream), plus the
 * Mcp-Session-Id header for stateful servers.
 *
 * Deliberately dependency-free — this is all the protocol surface the
 * gateway needs to consume external tool servers.
 */

const CLIENT_PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'ai-gateway', version: '1.0.0' };

export interface MCPRemoteTool {
  name: string;
  description?: string;
  inputSchema?: MCPToolSchema;
}

export interface MCPCallResult {
  isError: boolean;
  /** structuredContent if provided, otherwise best-effort parse of text content */
  data: unknown;
  /** raw text content blocks joined together */
  text: string;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

export class MCPClientError extends Error {
  constructor(message: string, public readonly code?: number) {
    super(message);
    this.name = 'MCPClientError';
  }
}

export class MCPClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private sessionId: string | null = null;
  private protocolVersion: string | null = null;
  private nextId = 1;
  private initialized = false;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = headers;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Perform the initialize handshake. Idempotent. */
  async initialize(): Promise<{ serverName?: string; version?: string }> {
    if (this.initialized) return {};

    const result = await this.request('initialize', {
      protocolVersion: CLIENT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });

    this.protocolVersion =
      result?.protocolVersion || CLIENT_PROTOCOL_VERSION;
    this.initialized = true;

    // Spec: after initialize, the client must send an initialized notification
    await this.notify('notifications/initialized');

    return {
      serverName: result?.serverInfo?.name,
      version: result?.serverInfo?.version,
    };
  }

  /** List all tools, following cursor pagination. */
  async listTools(): Promise<MCPRemoteTool[]> {
    await this.initialize();

    const tools: MCPRemoteTool[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.request(
        'tools/list',
        cursor ? { cursor } : {}
      );
      for (const tool of result?.tools || []) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
      cursor = result?.nextCursor || undefined;
    } while (cursor);

    return tools;
  }

  /** Call a tool by name. */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<MCPCallResult> {
    await this.initialize();

    const result = await this.request('tools/call', {
      name,
      arguments: args,
    });

    const textBlocks: string[] = [];
    for (const block of result?.content || []) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        textBlocks.push(block.text);
      }
    }
    const text = textBlocks.join('\n');

    let data: unknown = result?.structuredContent;
    if (data === undefined) {
      // Many servers return JSON serialized inside a text block
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return { isError: result?.isError === true, data, text };
  }

  /** Reset the session (forces a fresh handshake on next call). */
  reset(): void {
    this.sessionId = null;
    this.protocolVersion = null;
    this.initialized = false;
  }

  /** Send a JSON-RPC request and return its result (throws on error). */
  private async request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    const response = await this.post({ jsonrpc: '2.0', id, method, params });

    const message = await this.parseResponse(response, id);
    if (!message) {
      throw new MCPClientError(
        `MCP server returned no response for "${method}"`
      );
    }
    if (message.error) {
      throw new MCPClientError(
        `MCP error (${message.error.code}): ${message.error.message}`,
        message.error.code
      );
    }
    return message.result;
  }

  /** Send a JSON-RPC notification (no response expected). */
  private async notify(method: string, params?: unknown): Promise<void> {
    const response = await this.post({ jsonrpc: '2.0', method, params });
    // Drain/ignore the body; servers answer notifications with 202 or 200
    await response.text().catch(() => undefined);
  }

  private async post(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...this.headers,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    if (this.protocolVersion)
      headers['MCP-Protocol-Version'] = this.protocolVersion;

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    // Capture session id issued during initialize
    const session = response.headers.get('Mcp-Session-Id');
    if (session) this.sessionId = session;

    if (response.status === 404 && this.sessionId) {
      // Session expired — reset so the next call re-initializes
      this.reset();
      throw new MCPClientError('MCP session expired (404), please retry');
    }

    if (!response.ok && response.status !== 202) {
      const text = await response.text().catch(() => '');
      throw new MCPClientError(
        `MCP server HTTP ${response.status}: ${text.slice(0, 200)}`
      );
    }

    return response;
  }

  /**
   * Parse a Streamable HTTP response body — either a single JSON message or
   * an SSE stream containing the response for our request id.
   */
  private async parseResponse(
    response: Response,
    id: number
  ): Promise<JsonRpcResponse | null> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      const raw = await response.text();
      for (const event of raw.split(/\n\n/)) {
        const dataLines = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());
        if (dataLines.length === 0) continue;
        try {
          const message = JSON.parse(dataLines.join('')) as JsonRpcResponse;
          if (message.id === id && ('result' in message || 'error' in message)) {
            return message;
          }
        } catch {
          // Not JSON (keep-alive comment etc.) — skip
        }
      }
      return null;
    }

    // Plain JSON (may be empty for 202 Accepted)
    const text = await response.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as JsonRpcResponse;
    } catch {
      throw new MCPClientError(
        `MCP server returned invalid JSON: ${text.slice(0, 120)}`
      );
    }
  }
}
