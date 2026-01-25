import { StreamEvent, StreamEventType, StreamEventData } from '../types';

/**
 * Stream Event Emitter
 *
 * A simple event emitter for streaming agent/orchestrator events.
 * Supports multiple listeners and can be easily integrated with SSE or WebSocket.
 */
export class StreamEmitter {
  private listeners: Set<(event: StreamEvent) => void> = new Set();
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Add a listener for stream events
   */
  on(handler: (event: StreamEvent) => void): () => void {
    this.listeners.add(handler);
    // Return unsubscribe function
    return () => this.listeners.delete(handler);
  }

  /**
   * Remove a listener
   */
  off(handler: (event: StreamEvent) => void): void {
    this.listeners.delete(handler);
  }

  /**
   * Emit an event to all listeners
   */
  emit(type: StreamEventType, data: StreamEventData): void {
    const event: StreamEvent = {
      type,
      timestamp: Date.now() - this.startTime,
      data,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[StreamEmitter] Listener error:', error);
      }
    }
  }

  /**
   * Convenience methods for common events
   */

  status(message: string): void {
    this.emit('status', { message });
  }

  thinking(message: string): void {
    this.emit('thinking', { message });
  }

  delegationStart(agentName: string, task: string): void {
    this.emit('delegation_start', { agentName, task });
  }

  delegationEnd(agentName: string, task: string, durationMs: number, response?: string): void {
    this.emit('delegation_end', { agentName, task, durationMs, response });
  }

  toolCallStart(tool: string, input: Record<string, unknown>, agentName?: string): void {
    this.emit('tool_call_start', { tool, input, agentName });
  }

  toolCallEnd(
    tool: string,
    input: Record<string, unknown>,
    output: StreamEventData['output'],
    durationMs: number,
    agentName?: string
  ): void {
    this.emit('tool_call_end', { tool, input, output, durationMs, agentName });
  }

  agentThinking(agentName: string, iteration: number, maxIterations: number): void {
    this.emit('agent_thinking', { agentName, iteration, maxIterations });
  }

  agentResponse(agentName: string, content: string): void {
    this.emit('agent_response', { agentName, content });
  }

  content(content: string, partial: boolean = true): void {
    this.emit('content', { content, partial });
  }

  done(data: {
    response: string;
    conversationId: string;
    delegations?: StreamEventData['delegations'];
    totalDurationMs: number;
  }): void {
    this.emit('done', data);
  }

  error(error: string): void {
    this.emit('error', { error });
  }

  /**
   * Get elapsed time since creation
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Create a new stream emitter
 */
export function createStreamEmitter(): StreamEmitter {
  return new StreamEmitter();
}
