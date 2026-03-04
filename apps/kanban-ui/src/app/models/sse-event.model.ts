import { TaskOut } from './task.model';
import { ActivityEntryOut } from './activity.model';

export interface SseTaskCreated {
  type: 'task_created';
  payload: TaskOut;
}

export interface SseTaskUpdated {
  type: 'task_updated';
  payload: TaskOut;
}

export interface SseTaskDeleted {
  type: 'task_deleted';
  payload: { id: string };
}

export interface SseTaskExpired {
  type: 'task_expired';
  payload: { id: string; project: string; previousAssignee: string };
}

export interface SseActivityAdded {
  type: 'activity_added';
  payload: ActivityEntryOut;
}

export interface SseHeartbeat {
  type: 'heartbeat';
  ts: string;
}

export type SseEvent =
  | SseTaskCreated
  | SseTaskUpdated
  | SseTaskDeleted
  | SseTaskExpired
  | SseActivityAdded
  | SseHeartbeat;
