/**
 * Metrics Collector
 *
 * Centralized metrics collection for the AI Gateway service.
 * Tracks request timing, tool usage, LLM performance, and system health.
 */

interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
}

interface ToolMetrics {
  name: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgExecutionTimeMs: number;
  lastCalledAt?: string;
}

interface LLMMetrics {
  model: string;
  totalRequests: number;
  totalTokensPrompt: number;
  totalTokensCompletion: number;
  avgResponseTimeMs: number;
  errors: number;
}

interface SystemMetrics {
  uptime: number;
  memoryUsageMb: number;
  activeConnections: number;
  pendingApprovals: number;
  activeConversations: number;
}

export interface MetricsSnapshot {
  timestamp: string;
  requests: RequestMetrics;
  tools: Record<string, ToolMetrics>;
  llm: Record<string, LLMMetrics>;
  system: SystemMetrics;
}

/**
 * Circular buffer for storing recent response times
 */
class CircularBuffer {
  private buffer: number[] = [];
  private index = 0;
  private size: number;

  constructor(size = 1000) {
    this.size = size;
  }

  push(value: number): void {
    if (this.buffer.length < this.size) {
      this.buffer.push(value);
    } else {
      this.buffer[this.index] = value;
    }
    this.index = (this.index + 1) % this.size;
  }

  getPercentile(p: number): number {
    if (this.buffer.length === 0) return 0;
    const sorted = [...this.buffer].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getAverage(): number {
    if (this.buffer.length === 0) return 0;
    return this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
    this.index = 0;
  }
}

class MetricsCollector {
  private startTime = Date.now();
  private requestTimes = new CircularBuffer(1000);
  private toolMetrics = new Map<
    string,
    {
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      totalTimeMs: number;
      lastCalledAt?: string;
    }
  >();
  private llmMetrics = new Map<
    string,
    {
      totalRequests: number;
      totalTokensPrompt: number;
      totalTokensCompletion: number;
      totalTimeMs: number;
      errors: number;
    }
  >();

  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private activeConnections = 0;

  // External hooks for gathering additional metrics
  private externalMetrics: {
    getActiveConversations?: () => number;
    getPendingApprovals?: () => number;
  } = {};

  /**
   * Register external metric providers
   */
  registerExternalMetrics(providers: {
    getActiveConversations?: () => number;
    getPendingApprovals?: () => number;
  }): void {
    this.externalMetrics = { ...this.externalMetrics, ...providers };
  }

  /**
   * Record a completed request
   */
  recordRequest(
    durationMs: number,
    success: boolean,
    model?: string,
    promptTokens?: number,
    completionTokens?: number
  ): void {
    this.totalRequests++;
    this.requestTimes.push(durationMs);

    if (success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }

    if (model) {
      const metrics = this.llmMetrics.get(model) || {
        totalRequests: 0,
        totalTokensPrompt: 0,
        totalTokensCompletion: 0,
        totalTimeMs: 0,
        errors: 0,
      };

      metrics.totalRequests++;
      metrics.totalTimeMs += durationMs;
      metrics.totalTokensPrompt += promptTokens || 0;
      metrics.totalTokensCompletion += completionTokens || 0;
      if (!success) metrics.errors++;

      this.llmMetrics.set(model, metrics);
    }
  }

  /**
   * Record a tool execution
   */
  recordToolCall(toolName: string, durationMs: number, success: boolean): void {
    const metrics = this.toolMetrics.get(toolName) || {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalTimeMs: 0,
    };

    metrics.totalCalls++;
    metrics.totalTimeMs += durationMs;
    metrics.lastCalledAt = new Date().toISOString();

    if (success) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
    }

    this.toolMetrics.set(toolName, metrics);
  }

  /**
   * Track active connections
   */
  connectionOpened(): void {
    this.activeConnections++;
  }

  connectionClosed(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const tools: Record<string, ToolMetrics> = {};
    for (const [name, metrics] of this.toolMetrics) {
      tools[name] = {
        name,
        totalCalls: metrics.totalCalls,
        successfulCalls: metrics.successfulCalls,
        failedCalls: metrics.failedCalls,
        avgExecutionTimeMs:
          metrics.totalCalls > 0
            ? Math.round(metrics.totalTimeMs / metrics.totalCalls)
            : 0,
        lastCalledAt: metrics.lastCalledAt,
      };
    }

    const llm: Record<string, LLMMetrics> = {};
    for (const [model, metrics] of this.llmMetrics) {
      llm[model] = {
        model,
        totalRequests: metrics.totalRequests,
        totalTokensPrompt: metrics.totalTokensPrompt,
        totalTokensCompletion: metrics.totalTokensCompletion,
        avgResponseTimeMs:
          metrics.totalRequests > 0
            ? Math.round(metrics.totalTimeMs / metrics.totalRequests)
            : 0,
        errors: metrics.errors,
      };
    }

    const memUsage = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      requests: {
        totalRequests: this.totalRequests,
        successfulRequests: this.successfulRequests,
        failedRequests: this.failedRequests,
        avgResponseTimeMs: Math.round(this.requestTimes.getAverage()),
        p95ResponseTimeMs: Math.round(this.requestTimes.getPercentile(95)),
        p99ResponseTimeMs: Math.round(this.requestTimes.getPercentile(99)),
      },
      tools,
      llm,
      system: {
        uptime: Math.round((Date.now() - this.startTime) / 1000),
        memoryUsageMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        activeConnections: this.activeConnections,
        pendingApprovals: this.externalMetrics.getPendingApprovals?.() || 0,
        activeConversations:
          this.externalMetrics.getActiveConversations?.() || 0,
      },
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.requestTimes.clear();
    this.toolMetrics.clear();
    this.llmMetrics.clear();
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.activeConnections = 0;
  }
}

// Singleton instance
let metricsCollector: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector();
  }
  return metricsCollector;
}

export { MetricsCollector };
