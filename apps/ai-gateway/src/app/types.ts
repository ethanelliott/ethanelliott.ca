/**
 * MCP Tool Types - Model Context Protocol compatible tool definitions
 */

export interface MCPToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: MCPToolParameter;
  properties?: Record<string, MCPToolParameter>;
  required?: string[];
}

export interface MCPToolSchema {
  type: 'object';
  properties: Record<string, MCPToolParameter>;
  required?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: MCPToolSchema;
  category?: string;
  tags?: string[];
}

export interface MCPToolWithExecutor extends MCPTool {
  execute: (params: Record<string, unknown>) => Promise<MCPToolResult>;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    executionTimeMs: number;
    [key: string]: unknown;
  };
}

/**
 * Ollama API Types
 */

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
    index?: number;
  };
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: MCPToolSchema;
  };
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_ctx?: number;
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  done_reason?: 'stop' | 'length' | 'tool_calls';
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: Partial<OllamaMessage>;
  done: boolean;
}

/**
 * Agent Types
 */

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  tools?: string[]; // Tool names this agent can use
  maxIterations?: number;
  temperature?: number;
}

export interface AgentResult {
  success: boolean;
  response: string;
  toolCalls?: AgentToolCall[];
  iterations: number;
  totalDurationMs: number;
  error?: string;
}

export interface AgentToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: MCPToolResult;
  durationMs: number;
}

/**
 * Orchestrator Types
 */

export interface SubAgentDefinition {
  name: string;
  description: string;
  capabilities: string[];
  agent: AgentConfig;
}

export interface OrchestratorConfig {
  name: string;
  model?: string;
  subAgents: SubAgentDefinition[];
  routerModel?: string; // Model for fast tool/agent selection
  maxDelegations?: number;
}

export interface DelegationResult {
  agentName: string;
  task: string;
  result: AgentResult;
}

export interface OrchestratorResult {
  success: boolean;
  response: string;
  delegations: DelegationResult[];
  totalDurationMs: number;
}

/**
 * Chat API Types
 */

export interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
  stream?: boolean;
}

export interface ChatResponse {
  response: string;
  conversationId: string;
  delegations?: DelegationResult[];
  durationMs: number;
}

export interface StreamChunk {
  type: 'content' | 'tool_call' | 'delegation' | 'done' | 'error';
  content?: string;
  toolCall?: AgentToolCall;
  delegation?: DelegationResult;
  error?: string;
}

/**
 * Service Registry Types
 */

export interface MCPService {
  name: string;
  url: string;
  description?: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: string[]; // Tool names registered from this service
  lastSync?: string;
  error?: string;
}

export interface MCPServiceRegistration {
  name: string;
  url: string; // Base URL of the service (will append /mcp/tools, /mcp/tools/:name/execute)
  description?: string;
}

export interface MCPEndpointToolsResponse {
  tools: MCPTool[];
}

/**
 * Streaming Event Types - For real-time chat updates
 */

export type StreamEventType =
  | 'status'
  | 'thinking'
  | 'delegation_start'
  | 'delegation_end'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'agent_thinking'
  | 'agent_response'
  | 'content'
  | 'done'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  data: StreamEventData;
}

export interface StreamEventData {
  // Status events
  message?: string;

  // Delegation events
  agentName?: string;
  task?: string;

  // Tool call events
  tool?: string;
  input?: Record<string, unknown>;
  output?: MCPToolResult;
  durationMs?: number;

  // Agent events
  iteration?: number;
  maxIterations?: number;

  // Content/Response events
  content?: string;
  partial?: boolean;

  // Done event
  response?: string;
  conversationId?: string;
  delegations?: DelegationResult[];
  totalDurationMs?: number;

  // Error event
  error?: string;
}

/**
 * Event Emitter for streaming
 */
export type StreamEventHandler = (event: StreamEvent) => void;
