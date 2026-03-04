// Mirrors TaskState enum from apps/kanban/src/app/tasks/task.entity.ts
export enum TaskState {
  BACKLOG = 'BACKLOG',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
}

/** REST response shape — dates come back as ISO strings from JSON */
export interface TaskOut {
  id: string;
  title: string;
  description: string;
  state: TaskState;
  priority: number;
  project: string;
  assignee: string | null;
  assignedAt: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  directory: string | null;
  /** Number of dependencies this task has (populated by list + getById) */
  depCount?: number;
  /** Number of direct subtasks (populated by list + getById) */
  subtaskCount?: number;
}

export interface TaskIn {
  title: string;
  description: string;
  priority?: number;
  project: string;
  state?: TaskState;
  parentId?: string;
  directory?: string;
}

export interface TaskPatch {
  title?: string;
  description?: string;
  priority?: number;
  parentId?: string | null;
  directory?: string | null;
}

export interface TaskListFilters {
  project?: string;
  state?: TaskState;
  assignee?: string;
  priorityMin?: number;
  priorityMax?: number;
  createdAfter?: string;
  createdBefore?: string;
  search?: string;
}

export interface BatchTaskItem {
  title: string;
  description: string;
  priority?: number;
  state?: TaskState;
  parentId?: string;
  /** Indices into the same batch array */
  dependsOn?: number[];
}

export interface BatchCreate {
  project: string;
  tasks: BatchTaskItem[];
}

/**
 * Client-side mirror of the backend state machine.
 * Used for button rendering and drag-and-drop validation only —
 * the server is the authoritative source of truth.
 */
export const STATE_TRANSITIONS: Record<TaskState, TaskState[]> = {
  [TaskState.BACKLOG]: [TaskState.TODO],
  [TaskState.TODO]: [TaskState.IN_PROGRESS, TaskState.BACKLOG],
  [TaskState.IN_PROGRESS]: [
    TaskState.IN_REVIEW,
    TaskState.BLOCKED,
    TaskState.TODO,
  ],
  [TaskState.BLOCKED]: [TaskState.TODO],
  [TaskState.IN_REVIEW]: [TaskState.DONE, TaskState.IN_PROGRESS],
  [TaskState.DONE]: [],
};

export const ALL_STATES: TaskState[] = [
  TaskState.BACKLOG,
  TaskState.TODO,
  TaskState.IN_PROGRESS,
  TaskState.BLOCKED,
  TaskState.IN_REVIEW,
  TaskState.DONE,
];

export function priorityLabel(priority: number): string {
  if (priority <= 10) return 'P1';
  if (priority <= 25) return 'P2';
  if (priority <= 50) return 'P3';
  return 'P4+';
}

export function prioritySeverity(
  priority: number
): 'danger' | 'warn' | 'info' | 'secondary' {
  if (priority <= 10) return 'danger';
  if (priority <= 25) return 'warn';
  if (priority <= 50) return 'info';
  return 'secondary';
}
