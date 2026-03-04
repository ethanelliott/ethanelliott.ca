// Mirrors ActivityEntryType enum from apps/kanban/src/app/tasks/activity-entry.entity.ts
export enum ActivityEntryType {
  COMMENT = 'COMMENT',
  STATE_CHANGE = 'STATE_CHANGE',
  ASSIGNMENT = 'ASSIGNMENT',
  DEPENDENCY = 'DEPENDENCY',
  SUBTASK = 'SUBTASK',
}

export interface ActivityEntryOut {
  id: string;
  taskId: string;
  type: ActivityEntryType;
  author: string | null;
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any | null;
  createdAt: string;
}

export interface ActivityCommentIn {
  author: string;
  content: string;
}
