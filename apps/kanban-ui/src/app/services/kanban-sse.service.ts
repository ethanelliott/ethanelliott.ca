import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  SseTaskCreated,
  SseTaskUpdated,
  SseTaskDeleted,
  SseTaskExpired,
  SseActivityAdded,
  SseHeartbeat,
} from '../models/sse-event.model';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

@Injectable({ providedIn: 'root' })
export class KanbanSseService implements OnDestroy {
  private eventSource: EventSource | null = null;
  private currentProject: string | undefined;

  // ---------------------------------------------------------------- subjects

  private readonly _taskCreated$ = new Subject<SseTaskCreated>();
  private readonly _taskUpdated$ = new Subject<SseTaskUpdated>();
  private readonly _taskDeleted$ = new Subject<SseTaskDeleted>();
  private readonly _taskExpired$ = new Subject<SseTaskExpired>();
  private readonly _activityAdded$ = new Subject<SseActivityAdded>();
  private readonly _heartbeat$ = new Subject<SseHeartbeat>();
  private readonly _connectionState$ = new BehaviorSubject<ConnectionState>(
    'disconnected'
  );

  // --------------------------------------------------------------- streams

  /** Emits when a new task is created. */
  readonly taskCreated$: Observable<SseTaskCreated> =
    this._taskCreated$.asObservable();

  /** Emits when an existing task is updated (state change, patch, etc.). */
  readonly taskUpdated$: Observable<SseTaskUpdated> =
    this._taskUpdated$.asObservable();

  /** Emits when a task is soft-deleted. */
  readonly taskDeleted$: Observable<SseTaskDeleted> =
    this._taskDeleted$.asObservable();

  /** Emits when an in-progress task expires back to TODO. */
  readonly taskExpired$: Observable<SseTaskExpired> =
    this._taskExpired$.asObservable();

  /** Emits when a new activity entry (comment, state-change, etc.) is posted. */
  readonly activityAdded$: Observable<SseActivityAdded> =
    this._activityAdded$.asObservable();

  /** Emits every 15 s heartbeat from the server. */
  readonly heartbeat$: Observable<SseHeartbeat> =
    this._heartbeat$.asObservable();

  /** Current SSE connection state. */
  readonly connectionState$: Observable<ConnectionState> =
    this._connectionState$.asObservable();

  // --------------------------------------------------------------- connect

  /**
   * Opens (or re-opens) the SSE connection.
   * If a connection is already open for the same project, this is a no-op.
   * Passing a different project reconnects to the new scope.
   */
  connect(project?: string): void {
    if (
      this.eventSource &&
      this._connectionState$.value !== 'disconnected' &&
      this.currentProject === project
    ) {
      return;
    }

    this.disconnect();
    this.currentProject = project;
    this._connectionState$.next('connecting');

    const url = new URL(`${environment.apiUrl}/tasks/events`);
    if (project) url.searchParams.set('project', project);

    const es = new EventSource(url.toString());
    this.eventSource = es;

    es.addEventListener('open', () => {
      this._connectionState$.next('connected');
    });

    es.addEventListener('task_created', (e: MessageEvent) => {
      try {
        this._taskCreated$.next(JSON.parse(e.data) as SseTaskCreated);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener('task_updated', (e: MessageEvent) => {
      try {
        this._taskUpdated$.next(JSON.parse(e.data) as SseTaskUpdated);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener('task_deleted', (e: MessageEvent) => {
      try {
        this._taskDeleted$.next(JSON.parse(e.data) as SseTaskDeleted);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener('task_expired', (e: MessageEvent) => {
      try {
        this._taskExpired$.next(JSON.parse(e.data) as SseTaskExpired);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener('activity_added', (e: MessageEvent) => {
      try {
        this._activityAdded$.next(JSON.parse(e.data) as SseActivityAdded);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener('heartbeat', (e: MessageEvent) => {
      try {
        this._heartbeat$.next(JSON.parse(e.data) as SseHeartbeat);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener('error', () => {
      // EventSource will reconnect automatically; signal reconnecting state.
      if (es.readyState === EventSource.CONNECTING) {
        this._connectionState$.next('connecting');
      } else if (es.readyState === EventSource.CLOSED) {
        this._connectionState$.next('disconnected');
      }
    });
  }

  // ------------------------------------------------------------ disconnect

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._connectionState$.next('disconnected');
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
