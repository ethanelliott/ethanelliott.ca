import { ApprovalRequest, ApprovalResponse, MCPToolSchema } from '../types';
import { randomUUID } from 'crypto';

/**
 * Pending Approval
 *
 * Represents an approval request waiting for user response.
 */
interface PendingApproval {
  request: ApprovalRequest;
  resolve: (response: ApprovalResponse) => void;
  reject: (error: Error) => void;
  createdAt: number;
  timeoutMs: number;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Approval Manager Metrics
 */
interface ApprovalMetrics {
  totalRequested: number;
  totalApproved: number;
  totalRejected: number;
  totalTimedOut: number;
  totalCancelled: number;
  currentPending: number;
}

/**
 * Approval Manager
 *
 * Manages pending tool approval requests for human-in-the-loop workflows.
 * When a tool requires approval, the agent creates an approval request and
 * waits for the user to respond via the /chat/approve endpoint.
 */
class ApprovalManager {
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private defaultTimeoutMs = 5 * 60 * 1000; // 5 minutes default timeout
  private maxPendingApprovals = 100; // Prevent memory exhaustion
  private metrics: ApprovalMetrics = {
    totalRequested: 0,
    totalApproved: 0,
    totalRejected: 0,
    totalTimedOut: 0,
    totalCancelled: 0,
    currentPending: 0,
  };

  /**
   * Request approval for a tool execution
   *
   * @param tool - Name of the tool requiring approval
   * @param input - The parameters the tool will be called with
   * @param message - Message explaining why approval is needed
   * @param userParametersSchema - Schema for additional user-provided parameters
   * @param agentName - Name of the agent requesting approval
   * @param timeoutMs - How long to wait for approval before timing out
   * @returns Promise that resolves with the approval response
   */
  async requestApproval(
    tool: string,
    input: Record<string, unknown>,
    options: {
      message?: string;
      userParametersSchema?: MCPToolSchema;
      agentName?: string;
      timeoutMs?: number;
    } = {}
  ): Promise<ApprovalResponse> {
    // Prevent memory exhaustion
    if (this.pendingApprovals.size >= this.maxPendingApprovals) {
      throw new Error('Too many pending approvals. Please try again later.');
    }

    const approvalId = randomUUID();
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

    const request: ApprovalRequest = {
      approvalId,
      tool,
      input,
      message: options.message,
      userParametersSchema: options.userParametersSchema,
      agentName: options.agentName,
    };

    this.metrics.totalRequested++;
    this.metrics.currentPending++;

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingApprovals.delete(approvalId);
        this.metrics.totalTimedOut++;
        this.metrics.currentPending--;
        reject(new Error(`Approval request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const pending: PendingApproval = {
        request,
        resolve,
        reject,
        createdAt: Date.now(),
        timeoutMs,
        timeoutId,
      };

      this.pendingApprovals.set(approvalId, pending);
    });
  }

  /**
   * Get the approval request details for a given ID
   */
  getApprovalRequest(approvalId: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(approvalId)?.request;
  }

  /**
   * Submit an approval response
   *
   * @param response - The approval response from the user
   * @returns true if the approval was found and processed, false if not found
   */
  submitApproval(response: ApprovalResponse): boolean {
    const pending = this.pendingApprovals.get(response.approvalId);

    if (!pending) {
      return false;
    }

    // Clear timeout
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }

    // Remove from pending
    this.pendingApprovals.delete(response.approvalId);
    this.metrics.currentPending--;

    // Track approval/rejection
    if (response.approved) {
      this.metrics.totalApproved++;
    } else {
      this.metrics.totalRejected++;
    }

    // Resolve the waiting promise
    pending.resolve(response);

    return true;
  }

  /**
   * Cancel an approval request
   */
  cancelApproval(approvalId: string, reason?: string): boolean {
    const pending = this.pendingApprovals.get(approvalId);

    if (!pending) {
      return false;
    }

    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }

    this.pendingApprovals.delete(approvalId);
    this.metrics.currentPending--;
    this.metrics.totalCancelled++;
    pending.reject(new Error(reason || 'Approval cancelled'));

    return true;
  }

  /**
   * Get all pending approvals
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).map((p) => p.request);
  }

  /**
   * Check if there's a pending approval with the given ID
   */
  hasPendingApproval(approvalId: string): boolean {
    return this.pendingApprovals.has(approvalId);
  }

  /**
   * Get count of pending approvals
   */
  getPendingCount(): number {
    return this.pendingApprovals.size;
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): ApprovalMetrics {
    return { ...this.metrics, currentPending: this.pendingApprovals.size };
  }

  /**
   * Clear all pending approvals (cancels them)
   */
  clearAll(): void {
    for (const [id, pending] of this.pendingApprovals) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      this.metrics.totalCancelled++;
      pending.reject(new Error('All approvals cleared'));
    }
    this.metrics.currentPending = 0;
    this.pendingApprovals.clear();
  }
}

// Singleton instance
let approvalManager: ApprovalManager | null = null;

export function getApprovalManager(): ApprovalManager {
  if (!approvalManager) {
    approvalManager = new ApprovalManager();
  }
  return approvalManager;
}

export { ApprovalManager, ApprovalMetrics };
