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
  renderedHtml?: string;
  toolCalls?: DisplayToolCall[];
  thinking?: string;
  attachments?: FileAttachment[];
  timestamp: number;
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
