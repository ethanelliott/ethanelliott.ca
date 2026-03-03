export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  displayMessages: DisplayMessage[];
  config?: ChatConfig;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  name?: string;
  tool_call_id?: string;
  images?: string[];
}

export interface ToolCall {
  id?: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  renderedHtml?: any; // SafeHtml from DomSanitizer
  toolCalls?: DisplayToolCall[];
  thinking?: string;
  delegations?: DisplayDelegation[];
  attachments?: FileAttachment[];
  timestamp: number;
}

export interface DisplayDelegation {
  agentName: string;
  task?: string;
  status: 'pending' | 'complete';
  content?: string;
  thinking?: string;
  durationMs?: number;
}

export interface DisplayToolCall {
  name: string;
  status: 'pending' | 'success' | 'error' | 'approval-required';
  input?: Record<string, unknown>;
  output?: string;
  approvalId?: string;
  durationMs?: number;
}

export interface ChatConfig {
  model?: string;
  temperature?: number;
  enabledTools?: string[];
  disabledTools?: string[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  starterMessage?: string;
}

export interface StreamEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface FileAttachment {
  name: string;
  type: string;
  base64: string;
  previewUrl?: string;
}

// --- Gateway Config Types ---

export interface GatewayConfig {
  orchestrator: GatewayOrchestratorConfig;
  subAgents: GatewaySubAgentDefinition[];
  tools: GatewayToolInfo[];
  categories: string[];
}

export interface GatewayOrchestratorConfig {
  name: string;
  model?: string;
  systemPrompt?: string;
  maxDelegations?: number;
  routerModel?: string;
}

export interface GatewaySubAgentDefinition {
  name: string;
  description: string;
  capabilities: string[];
  agent: GatewayAgentConfig;
}

export interface GatewayAgentConfig {
  name: string;
  description: string;
  model?: string;
  systemPrompt: string;
  tools?: string[];
  maxIterations?: number;
  temperature?: number;
}

export interface GatewayToolInfo {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  parameters?: unknown;
  approval?: { required: boolean; message?: string };
  enabled: boolean;
}

export interface GatewayModelInfo {
  name: string;
  sizeGb: number;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}

export interface GatewayHealthInfo {
  status: 'healthy' | 'degraded';
  ollama: 'connected' | 'disconnected';
  orchestratorModel?: string;
  subAgentCount: number;
  toolCount: number;
}
