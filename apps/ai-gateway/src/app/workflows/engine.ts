import {
  WorkflowGraph,
  WorkflowNode,
  TemplateScope,
  RunTrigger,
  StepExecutionContext,
} from './workflow.types';
import { WorkflowEntity } from './entities/workflow.entity';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { getStepRegistry } from './step-registry';
import { getWorkflowRepos } from './db';
import { renderDeep } from './templating';
import { getToolRegistry } from '../mcp';

const DEFAULT_STEP_TIMEOUT_MS = 60_000;
const MAX_EXECUTED_STEPS = 100;

export interface GraphValidationError {
  message: string;
  nodeId?: string;
  edgeId?: string;
}

/**
 * Validate a workflow graph against the step registry and DAG rules.
 * Returns an empty array when the graph is valid.
 */
export function validateGraph(graph: WorkflowGraph): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  const registry = getStepRegistry();
  const nodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({ message: `Duplicate node id "${node.id}"`, nodeId: node.id });
    }
    nodeIds.add(node.id);

    const stepType = registry.get(node.kind);
    if (!stepType) {
      errors.push({
        message: `Unknown step kind "${node.kind}"`,
        nodeId: node.id,
      });
    }

    // Unattended runs can never satisfy interactive approval
    if (node.kind === 'tool_call') {
      const toolName = node.config?.['tool'] as string | undefined;
      if (toolName) {
        const tool = getToolRegistry().get(toolName);
        if (tool?.approval?.required) {
          errors.push({
            message: `Tool "${toolName}" requires interactive approval and cannot be used in a workflow`,
            nodeId: node.id,
          });
        }
      }
    }
  }

  const triggers = graph.nodes.filter(
    (n) => registry.get(n.kind)?.isTrigger === true
  );
  if (triggers.length === 0) {
    errors.push({ message: 'Workflow needs a trigger node' });
  } else if (triggers.length > 1) {
    errors.push({ message: 'Workflow can only have one trigger node' });
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push({
        message: `Edge "${edge.id}" references missing node "${edge.from}"`,
        edgeId: edge.id,
      });
    }
    if (!nodeIds.has(edge.to)) {
      errors.push({
        message: `Edge "${edge.id}" references missing node "${edge.to}"`,
        edgeId: edge.id,
      });
    }
    if (edge.condition) {
      const fromNode = graph.nodes.find((n) => n.id === edge.from);
      if (fromNode && fromNode.kind !== 'condition') {
        errors.push({
          message: `Edge "${edge.id}" has a condition but its source "${edge.from}" is not a condition node`,
          edgeId: edge.id,
        });
      }
    }
  }

  // Cycle detection (Kahn's algorithm)
  if (errors.length === 0) {
    const inDegree = new Map<string, number>();
    for (const id of nodeIds) inDegree.set(id, 0);
    for (const edge of graph.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
    const queue = Array.from(nodeIds).filter((id) => inDegree.get(id) === 0);
    let visited = 0;
    while (queue.length) {
      const id = queue.shift()!;
      visited++;
      for (const edge of graph.edges) {
        if (edge.from !== id) continue;
        const next = (inDegree.get(edge.to) || 0) - 1;
        inDegree.set(edge.to, next);
        if (next === 0) queue.push(edge.to);
      }
    }
    if (visited !== nodeIds.size) {
      errors.push({ message: 'Workflow graph contains a cycle' });
    }
  }

  return errors;
}

/**
 * Workflow Execution Engine
 *
 * Runs are detached from HTTP requests: `startRun` persists a run row and
 * returns immediately; execution continues in the background writing
 * per-step logs as it goes. Traversal is sequential (queue-based) with
 * condition-edge branching; joins have no barrier semantics — a node runs
 * the first time it is reached and is skipped on later arrivals.
 */
class WorkflowEngine {
  private activeRuns = new Map<
    string,
    { abort: AbortController; workflowId: string }
  >();

  /** Start a run in the background and return its id. */
  async startRun(
    workflow: WorkflowEntity,
    input: unknown,
    trigger: RunTrigger
  ): Promise<string> {
    const { runs } = getWorkflowRepos();

    const run = await runs.save(
      runs.create({
        workflowId: workflow.id,
        status: 'running',
        trigger,
        input: input ?? null,
        output: null,
        error: null,
        finishedAt: null,
      })
    );

    const abort = new AbortController();
    this.activeRuns.set(run.id, { abort, workflowId: workflow.id });

    // Fire and forget — errors are captured into the run row
    this.executeRun(workflow, run, input, abort.signal)
      .catch((error) => {
        console.error(`[Workflows] Run ${run.id} crashed:`, error);
      })
      .finally(() => {
        this.activeRuns.delete(run.id);
      });

    return run.id;
  }

  /** Request cancellation of an active run. */
  cancel(runId: string): boolean {
    const entry = this.activeRuns.get(runId);
    if (!entry) return false;
    entry.abort.abort();
    return true;
  }

  isActive(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  /** Whether any run of this workflow is currently executing */
  isWorkflowActive(workflowId: string): boolean {
    for (const entry of this.activeRuns.values()) {
      if (entry.workflowId === workflowId) return true;
    }
    return false;
  }

  private async executeRun(
    workflow: WorkflowEntity,
    run: WorkflowRunEntity,
    input: unknown,
    signal: AbortSignal
  ): Promise<void> {
    const { runs, stepRuns } = getWorkflowRepos();
    const registry = getStepRegistry();
    const graph = workflow.graph;

    const scope: TemplateScope = {
      input: input ?? {},
      nodes: {},
      run: {
        id: run.id,
        workflowId: workflow.id,
        startedAt: run.startedAt?.toISOString?.() ?? new Date().toISOString(),
      },
    };

    const nodesById = new Map<string, WorkflowNode>(
      graph.nodes.map((n) => [n.id, n])
    );
    const triggerNode = graph.nodes.find(
      (n) => registry.get(n.kind)?.isTrigger === true
    );

    let failure: { nodeId: string; error: string } | null = null;
    let sequence = 0;
    const executed = new Set<string>();
    const queue: string[] = triggerNode ? [triggerNode.id] : [];

    try {
      while (queue.length > 0) {
        if (signal.aborted) {
          throw new RunCancelledError();
        }
        if (executed.size >= MAX_EXECUTED_STEPS) {
          throw new Error(
            `Run exceeded the ${MAX_EXECUTED_STEPS}-step safety limit`
          );
        }

        const nodeId = queue.shift()!;
        if (executed.has(nodeId)) continue;
        const node = nodesById.get(nodeId);
        if (!node) continue;
        executed.add(nodeId);

        const stepType = registry.get(node.kind);
        if (!stepType) {
          throw new Error(`Unknown step kind "${node.kind}" at node ${nodeId}`);
        }

        sequence++;
        const renderedConfig = renderDeep(node.config ?? {}, scope) as Record<
          string,
          unknown
        >;

        const stepRow = await stepRuns.save(
          stepRuns.create({
            runId: run.id,
            nodeId: node.id,
            kind: node.kind,
            status: 'running',
            sequence,
            input: renderedConfig,
            output: null,
            error: null,
            attempts: 1,
            finishedAt: null,
            durationMs: null,
          })
        );

        const stepStart = Date.now();
        try {
          const output = await this.executeStepWithRetries(
            stepType.execute,
            { node, config: renderedConfig, scope, signal },
            node,
            (attempts) => {
              stepRow.attempts = attempts;
            },
            signal
          );

          scope.nodes[node.id] = output;

          stepRow.status = 'succeeded';
          stepRow.output = output ?? null;
          stepRow.finishedAt = new Date();
          stepRow.durationMs = Date.now() - stepStart;
          await stepRuns.save(stepRow);

          // Enqueue downstream nodes, honouring condition branches
          const isCondition = node.kind === 'condition';
          const branch = isCondition
            ? String((output as { result?: boolean })?.result === true)
            : null;
          for (const edge of graph.edges) {
            if (edge.from !== node.id) continue;
            if (isCondition && edge.condition && edge.condition !== branch) {
              continue;
            }
            queue.push(edge.to);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          stepRow.status =
            error instanceof RunCancelledError ? 'skipped' : 'failed';
          stepRow.error = message;
          stepRow.finishedAt = new Date();
          stepRow.durationMs = Date.now() - stepStart;
          await stepRuns.save(stepRow);

          if (error instanceof RunCancelledError) throw error;
          failure = { nodeId: node.id, error: message };
          break;
        }
      }

      run.output = scope.nodes;
      if (failure) {
        run.status = 'failed';
        run.error = `Step "${failure.nodeId}" failed: ${failure.error}`;
      } else {
        run.status = 'succeeded';
      }
    } catch (error) {
      run.output = scope.nodes;
      if (error instanceof RunCancelledError || signal.aborted) {
        run.status = 'cancelled';
        run.error = 'Run cancelled';
      } else {
        run.status = 'failed';
        run.error = error instanceof Error ? error.message : String(error);
      }
    }

    run.finishedAt = new Date();
    await runs.save(run);

    if (run.status === 'failed' && workflow.settings?.notifyOnFailure) {
      await this.notifyFailure(workflow, run);
    }
  }

  private async executeStepWithRetries(
    execute: (ctx: StepExecutionContext) => Promise<unknown>,
    ctx: StepExecutionContext,
    node: WorkflowNode,
    onAttempt: (attempts: number) => void,
    runSignal: AbortSignal
  ): Promise<unknown> {
    const timeoutMs = node.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
    const maxAttempts = 1 + (node.retries ?? 0);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt(attempt);
      if (runSignal.aborted) throw new RunCancelledError();

      const stepSignal = AbortSignal.any([
        runSignal,
        AbortSignal.timeout(timeoutMs),
      ]);

      try {
        return await execute({ ...ctx, signal: stepSignal });
      } catch (error) {
        if (runSignal.aborted) throw new RunCancelledError();
        lastError =
          stepSignal.aborted && !runSignal.aborted
            ? new Error(`Step timed out after ${timeoutMs}ms`)
            : error;

        if (attempt < maxAttempts) {
          // Exponential backoff between retries: 1s, 2s, 4s…
          await sleep(1000 * Math.pow(2, attempt - 1), runSignal);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async notifyFailure(
    workflow: WorkflowEntity,
    run: WorkflowRunEntity
  ): Promise<void> {
    try {
      await getToolRegistry().execute('send_notification', {
        title: `Workflow failed: ${workflow.name}`,
        message: `${run.error}\n\nRun: ${run.id}`,
        priority: 'high',
        tags: 'warning',
      });
    } catch (error) {
      console.error('[Workflows] Failure notification failed:', error);
    }
  }
}

class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new RunCancelledError());
      },
      { once: true }
    );
  });
}

const engine = new WorkflowEngine();

export function getWorkflowEngine(): WorkflowEngine {
  return engine;
}
