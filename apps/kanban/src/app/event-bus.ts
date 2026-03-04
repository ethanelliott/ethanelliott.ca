import { EventEmitter } from 'events';
import { TaskOut } from './tasks/task.entity';
import { ActivityEntryOut } from './tasks/activity-entry.entity';

// ------------------------------------------------------------------ types

export interface SseTaskUpdated {
  type: 'task_updated';
  payload: TaskOut;
}

export interface SseTaskCreated {
  type: 'task_created';
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
  payload: { taskId: string } & ActivityEntryOut;
}

export interface SseHeartbeat {
  type: 'heartbeat';
  ts: string;
}

export type SseEnvelope =
  | SseTaskUpdated
  | SseTaskCreated
  | SseTaskDeleted
  | SseTaskExpired
  | SseActivityAdded
  | SseHeartbeat;

// ------------------------------------------------------------------ bus

/**
 * Simple in-process pub/sub for SSE fan-out.
 * All mutations in TasksService emit to this bus; the SSE route listens and
 * forwards to every connected browser client.
 */
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(500); // support many concurrent SSE clients

export function emitSse(envelope: SseEnvelope): void {
  eventBus.emit('sse', envelope);
}
