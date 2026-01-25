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
