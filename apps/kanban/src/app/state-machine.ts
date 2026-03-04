import { TaskState } from './tasks/task.entity';

export const STATE_TRANSITIONS: Record<TaskState, TaskState[]> = {
  [TaskState.BACKLOG]: [TaskState.TODO],
  [TaskState.TODO]: [TaskState.IN_PROGRESS, TaskState.BACKLOG],
  [TaskState.IN_PROGRESS]: [
    TaskState.IN_REVIEW,
    TaskState.BLOCKED,
    TaskState.TODO,
  ],
  [TaskState.BLOCKED]: [TaskState.TODO],
  [TaskState.IN_REVIEW]: [
    TaskState.DONE,
    TaskState.IN_PROGRESS,
    TaskState.CHANGES_REQUESTED,
  ],
  [TaskState.CHANGES_REQUESTED]: [TaskState.IN_PROGRESS],
  [TaskState.DONE]: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * States that clear the assignee on transition.
 */
export const ASSIGNEE_CLEARING_STATES = new Set<TaskState>([
  TaskState.TODO,
  TaskState.BACKLOG,
]);
