# AI Gateway Chat UI Implementation Plan

## Overview

This document outlines the plan for building a chat interface that connects to the AI Gateway service. The UI will be a React application that provides real-time streaming chat with tool execution visibility, approval workflows, and full conversation control.

## API Endpoints Summary

### Core Chat Endpoints

| Endpoint              | Method | Description                                                          |
| --------------------- | ------ | -------------------------------------------------------------------- |
| `/chat/stream`        | POST   | **Primary endpoint** - Stateless streaming chat with message history |
| `/chat/stateless`     | POST   | Alias for `/chat/stream`                                             |
| `/chat/approve`       | POST   | Submit approval for tool execution                                   |
| `/chat/approvals`     | GET    | List pending approval requests                                       |
| `/chat/approvals/:id` | DELETE | Cancel a pending approval                                            |

### Tool Management Endpoints

| Endpoint                    | Method | Description               |
| --------------------------- | ------ | ------------------------- |
| `/tools`                    | GET    | List all available tools  |
| `/tools/:name`              | GET    | Get specific tool details |
| `/tools/categories`         | GET    | List tool categories      |
| `/tools/category/:category` | GET    | List tools by category    |

## Recommended Architecture

### 1. Stateless Chat Pattern

Use the `/chat/stream` endpoint which:
- Accepts full message history in each request
- No server-side conversation state to manage
- Supports tool enable/disable per request
- Returns updated message history in response with **activity metadata**

```typescript
// Message with activity metadata
interface Message {
  role: 'user' | 'assistant';
  content: string;
  activity?: {
    delegations?: Array<{
      agent: string;         // Which sub-agent handled it
      task: string;          // What was delegated
      tools?: string[];      // Tools the agent used
      response?: string;     // Agent's response
    }>;
    toolCalls?: Array<{
      tool: string;          // Tool name
      input: object;         // Tool input
      output: unknown;       // Tool result
      success: boolean;      // Whether it succeeded
    }>;
    durationMs?: number;     // How long this turn took
  };
}

// Request format
interface ChatRequest {
  messages: Message[];
  config?: {
    enabledTools?: string[];      // Whitelist: only these tools
    disabledTools?: string[];     // Blacklist: disable these tools
    model?: string;               // Override model
    temperature?: number;         // 0-2
    includeActivityContext?: boolean;  // Include activity in LLM context (default: true)
  };
}
```

#### Activity Metadata Flow

1. **User sends message** → Frontend sends message array
2. **Backend processes** → Orchestrator delegates, tools run, etc.
3. **Done event received** → Contains `messages` array with new assistant message
4. **Assistant message has `activity`** → Contains delegations, tool calls, timing
5. **Frontend stores complete message** → Including activity for visualization
6. **Next request** → Frontend sends messages including activity metadata
7. **Backend uses activity context** → When `includeActivityContext: true`, activity is injected into LLM history so it remembers what tools were used

This solves the "that" problem:
```
User: "What's 1500 * 1.15?"
Assistant: "The answer is 1725" (activity: { toolCalls: [{ tool: "calculate", ... }] })

User: "Add 10 to that"
Backend sees: "[Tool calculate: succeeded -> 1725]\n\nThe answer is 1725"
Assistant: "1725 + 10 = 1735"
```

### 2. NDJSON Streaming

The API returns newline-delimited JSON (NDJSON). Each line is a complete JSON object:

```typescript
interface StreamEvent {
  event: string;      // Event type
  timestamp: number;  // ms since request start
  data: object;       // Event-specific data
}
```

**Event Types:**
- `status` - General status messages
- `thinking` - Orchestrator/agent processing
- `token` - Real-time LLM output tokens
- `delegation_start/end` - Sub-agent delegation
- `tool_call_start/end` - Tool executions
- `agent_thinking/response` - Sub-agent activity
- `approval_required` - User approval needed
- `approval_received` - Approval processed
- `done` - Final response with full context
- `error` - Error occurred

### 3. Streaming Client Implementation

```typescript
async function* streamChat(
  messages: Message[],
  config?: SessionConfig
): AsyncGenerator<StreamEvent> {
  const response = await fetch('/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, config }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        yield JSON.parse(line);
      }
    }
  }
}
```

## UI Components

### 1. Chat Container
- Message list with user/assistant bubbles
- Auto-scroll to bottom
- Loading states during streaming

### 2. Message Input
- Text input with send button
- Keyboard shortcuts (Enter to send)
- Disabled during streaming

### 3. Tool Panel (Sidebar)
```
┌─────────────────────────┐
│ Available Tools         │
├─────────────────────────┤
│ ☑️ get_current_time     │
│ ☑️ calculate            │
│ ☑️ http_request         │
│ ☐ sensitive_action      │
└─────────────────────────┘
```
- Toggle checkboxes to enable/disable tools
- Group by category
- Show tool descriptions on hover

### 4. Activity Panel
Real-time visibility into agent operations:
```
┌─────────────────────────────────────────┐
│ Activity                                │
├─────────────────────────────────────────┤
│ 🔄 Orchestrator thinking...             │
│ ➡️ Delegated to: utility-assistant      │
│   Task: "Get current time"              │
│ 🔧 Tool: get_current_time               │
│   Result: "2026-01-25T18:48:53Z"        │
│ ✅ Agent responded                      │
│ ✅ Done (1.2s)                          │
└─────────────────────────────────────────┘
```

### 5. Approval Dialog (Modal)
When `approval_required` event is received:
```
┌─────────────────────────────────────────┐
│ ⚠️ Approval Required                    │
├─────────────────────────────────────────┤
│ Tool: sensitive_action                  │
│ Action: restart_server                  │
│ Target: production-web-01               │
│                                         │
│ This action requires your approval.     │
│                                         │
│ [Reject]              [Approve]         │
└─────────────────────────────────────────┘
```

## State Management

### React State Structure
```typescript
interface ChatState {
  // Conversation
  messages: Message[];
  isStreaming: boolean;
  
  // Tools
  availableTools: Tool[];
  enabledTools: Set<string>;
  
  // Activity
  activities: Activity[];
  
  // Approvals
  pendingApproval: ApprovalRequest | null;
}
```

### Message Flow
1. User types message → Add to `messages` array
2. Call `/chat/stream` with full `messages` + config
3. Process stream events:
   - `thinking/delegation/tool_call` → Update `activities`
   - `approval_required` → Show approval modal, pause stream
   - `token` → Append to pending assistant message
   - `done` → Replace pending message with final, update `messages`

### Approval Flow
1. Receive `approval_required` event
2. Show modal with tool details
3. User clicks Approve/Reject
4. POST to `/chat/approve` with decision
5. Stream continues automatically (server resumes)

## Project Structure

```
apps/ai-chat/
├── src/
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   └── index.ts
│   │   ├── Tools/
│   │   │   ├── ToolPanel.tsx
│   │   │   ├── ToolItem.tsx
│   │   │   └── index.ts
│   │   ├── Activity/
│   │   │   ├── ActivityPanel.tsx
│   │   │   ├── ActivityItem.tsx
│   │   │   └── index.ts
│   │   └── Approval/
│   │       ├── ApprovalModal.tsx
│   │       └── index.ts
│   ├── hooks/
│   │   ├── useChat.ts         # Main chat logic
│   │   ├── useStreamChat.ts   # NDJSON streaming
│   │   ├── useTools.ts        # Tool management
│   │   └── useApproval.ts     # Approval handling
│   ├── api/
│   │   ├── client.ts          # API client
│   │   └── types.ts           # API types
│   ├── App.tsx
│   └── main.tsx
├── public/
└── package.json
```

## Implementation Phases

### Phase 1: Core Chat (MVP)
- [ ] Project setup (Vite + React + TypeScript)
- [ ] Basic message list and input
- [ ] NDJSON streaming implementation
- [ ] Simple message display
- [ ] Basic styling

### Phase 2: Tool Management
- [ ] Fetch and display available tools
- [ ] Tool enable/disable toggles
- [ ] Pass tool config to API
- [ ] Show tool categories

### Phase 3: Activity Visibility
- [ ] Activity panel component
- [ ] Process streaming events
- [ ] Show delegation/tool call activity
- [ ] Token streaming display

### Phase 4: Approval Workflow
- [ ] Approval modal component
- [ ] Handle `approval_required` events
- [ ] Submit approvals via API
- [ ] Resume stream after approval

### Phase 5: Polish
- [ ] Error handling and retry
- [ ] Loading states and animations
- [ ] Responsive design
- [ ] Dark mode support
- [ ] Keyboard shortcuts

## Tech Stack Recommendation

- **Framework**: React 18+ with hooks
- **Build**: Vite
- **Styling**: Tailwind CSS
- **State**: React useState/useReducer (no need for Redux)
- **Icons**: Lucide React
- **Markdown**: react-markdown (for formatting responses)

## API Configuration

```typescript
// api/client.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = {
  chat: {
    stateless: (data: ChatRequest) =>
      fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    approve: (data: ApprovalResponse) =>
      fetch(`${API_BASE}/chat/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },
  tools: {
    list: () => fetch(`${API_BASE}/tools`).then(r => r.json()),
  },
};
```

## Next Steps

1. **Create the app scaffold**: `npx nx g @nx/react:app ai-chat`
2. **Install dependencies**: tailwindcss, lucide-react, react-markdown
3. **Implement streaming hook**: Core NDJSON parser
4. **Build chat components**: Message list, input, bubbles
5. **Add tool panel**: Fetch and display tools with toggles
6. **Implement activity panel**: Real-time event display
7. **Add approval flow**: Modal and API integration
8. **Test end-to-end**: Full chat flow with tools and approvals
