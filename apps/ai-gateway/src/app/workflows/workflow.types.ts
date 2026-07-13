import { z } from 'zod';
import { MCPToolSchema } from '../types';

/**
 * Workflow graph schema
 *
 * A workflow is a DAG of nodes connected by edges. Nodes carry a step `kind`
 * (resolved against the step registry) and a `config` object whose string
 * values may contain {{ template }} expressions resolved at runtime.
 *
 * The graph format is presentation-agnostic: `position` exists purely for
 * the visual editor and is ignored by the engine.
 */

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.string().min(1),
  label: z.string().max(120).optional(),
  config: z.record(z.unknown()).default({}),
  /** Editor-only: canvas coordinates */
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  /** Per-node execution limits (engine defaults apply when omitted) */
  timeoutMs: z.number().int().min(100).max(600000).optional(),
  retries: z.number().int().min(0).max(5).optional(),
});

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string().min(1),
  to: z.string().min(1),
  /**
   * Only meaningful on edges leaving a `condition` node: the edge is
   * followed when the condition's boolean result matches. Edges without a
   * condition are always followed.
   */
  condition: z.enum(['true', 'false']).optional(),
});

export const WorkflowGraphSchema = z.object({
  nodes: z.array(WorkflowNodeSchema).min(1).max(100),
  edges: z.array(WorkflowEdgeSchema).default([]),
});

export const WorkflowSettingsSchema = z.object({
  /** Push a ntfy notification when a run fails */
  notifyOnFailure: z.boolean().optional(),
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type WorkflowSettings = z.infer<typeof WorkflowSettingsSchema>;

/** Everything a template expression can reach at render time */
export interface TemplateScope {
  /** The run's trigger input payload */
  input: unknown;
  /** Outputs of previously executed nodes, keyed by node id */
  nodes: Record<string, unknown>;
  /** Run metadata */
  run: { id: string; workflowId: string; startedAt: string };
}

export type RunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type StepStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

export type RunTrigger = 'manual' | 'api' | 'cron';

/** Context handed to a step executor */
export interface StepExecutionContext {
  node: WorkflowNode;
  /** Node config with all {{ templates }} already rendered */
  config: Record<string, unknown>;
  scope: TemplateScope;
  signal: AbortSignal;
}

export interface StepType {
  kind: string;
  name: string;
  description: string;
  category: string;
  /** JSON-schema-shaped config description (drives the editor's form) */
  configSchema: MCPToolSchema;
  /** Trigger kinds are entry points; they receive the run input */
  isTrigger?: boolean;
  execute: (ctx: StepExecutionContext) => Promise<unknown>;
}
