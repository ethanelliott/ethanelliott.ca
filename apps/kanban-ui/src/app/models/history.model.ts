import { TaskState } from './task.model';

export interface StateHistoryEntry {
  id: string;
  taskId: string;
  fromState: TaskState | null;
  toState: TaskState;
  timestamp: string;
}

/**
 * Response from GET /tasks/:id/history.
 * durations values are milliseconds spent in that state (null = ongoing).
 */
export interface HistoryResponse {
  transitions: StateHistoryEntry[];
  durations: Record<string, number | null>;
}
