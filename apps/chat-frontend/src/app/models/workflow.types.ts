/** Workflow graph + API types (mirror of the gateway's workflow module) */

export interface WorkflowNode {
  id: string;
  kind: string;
  label?: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
  timeoutMs?: number;
  retries?: number;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  condition?: 'true' | 'false';
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowSettings {
  notifyOnFailure?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  graph: WorkflowGraph;
  settings: WorkflowSettings;
  enabled: boolean;
  cron: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  cron: string | null;
  nodeCount: number;
  updatedAt: string;
  lastRun: {
    id: string;
    status: RunStatus;
    startedAt: string;
    finishedAt: string | null;
  } | null;
}

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';
export type StepStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

export interface WorkflowRunSummary {
  id: string;
  status: RunStatus;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface WorkflowStepRun {
  id: string;
  nodeId: string;
  kind: string;
  status: StepStatus;
  sequence: number;
  input: unknown;
  output: unknown;
  error: string | null;
  attempts: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  workflowId: string;
  input: unknown;
  output: Record<string, unknown> | null;
  active: boolean;
  steps: WorkflowStepRun[];
}

export interface StepTypeConfigProperty {
  type: string;
  description?: string;
  enum?: string[];
}

export interface StepTypeInfo {
  kind: string;
  name: string;
  description: string;
  category: string;
  isTrigger: boolean;
  configSchema: {
    type: 'object';
    properties: Record<string, StepTypeConfigProperty>;
    required?: string[];
  };
}

export interface GraphValidationError {
  message: string;
  nodeId?: string;
  edgeId?: string;
}
