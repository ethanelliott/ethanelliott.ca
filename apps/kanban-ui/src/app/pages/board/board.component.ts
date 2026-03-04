import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { KanbanApiService } from '../../services/kanban-api.service';
import { KanbanSseService } from '../../services/kanban-sse.service';
import { ProjectService } from '../../services/project.service';
import {
  TaskOut,
  TaskState,
  ALL_STATES,
  STATE_TRANSITIONS,
} from '../../models/task.model';
import { BoardColumnComponent, TaskDropEvent } from './board-column.component';
import { NewTaskDialogComponent } from './new-task-dialog.component';

/** CDK drop list IDs this column can drag into, derived from state machine */
const COLUMN_CONNECTIONS: Record<TaskState, string[]> = {
  [TaskState.BACKLOG]: ['col-TODO'],
  [TaskState.TODO]: ['col-IN_PROGRESS', 'col-BACKLOG'],
  [TaskState.IN_PROGRESS]: ['col-IN_REVIEW', 'col-BLOCKED', 'col-TODO'],
  [TaskState.BLOCKED]: ['col-TODO'],
  [TaskState.IN_REVIEW]: ['col-DONE', 'col-IN_PROGRESS'],
  [TaskState.DONE]: [],
};

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    ButtonModule,
    SkeletonModule,
    ToastModule,
    BoardColumnComponent,
    NewTaskDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="board-page">
      <!-- Header bar -->
      <div class="board-header">
        <h2 class="board-title">
          Board @if (projectService.selectedProject(); as p) {
          <span class="project-chip">{{ p }}</span>
          }
        </h2>
        <div class="header-actions">
          @if (loading()) {
          <span class="loading-label">
            <i class="pi pi-spin pi-spinner"></i> Loading…
          </span>
          }
          <p-button
            label="New Task"
            icon="pi pi-plus"
            size="small"
            (onClick)="showNewTaskDialog.set(true)"
          />
        </div>
      </div>

      <!-- Board columns (desktop scroll / mobile snap) -->
      <div class="board-columns">
        @if (loading()) { @for (i of [0,1,2,3,4,5]; track i) {
        <div class="skeleton-col">
          <div class="skeleton-col-header"></div>
          @for (j of [0,1,2]; track j) {
          <div class="skeleton-card"></div>
          }
        </div>
        } } @else { @for (state of ALL_STATES; track state) {
        <app-board-column
          [state]="state"
          [tasks]="columnTasks(state)"
          [connectedTo]="connections(state)"
          (taskDropped)="handleTransition($event)"
        />
        } }
      </div>
    </div>

    <!-- New task dialog -->
    <app-new-task-dialog
      [(visible)]="showNewTaskDialog"
      (taskCreated)="onTaskCreated($event)"
    />
    <p-toast />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .board-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .board-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px 10px;
      flex-shrink: 0;
      border-bottom: 1px solid var(--p-surface-700);
    }

    .board-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--p-text-color);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .project-chip {
      font-size: 0.72rem;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
      color: var(--p-primary-color);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .loading-label {
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .board-columns {
      display: flex;
      gap: 12px;
      padding: 14px 16px;
      overflow-x: auto;
      overflow-y: hidden;
      flex: 1;
      align-items: flex-start;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
    }

    /* Skeleton columns while loading */
    .skeleton-col {
      display: flex;
      flex-direction: column;
      min-width: 220px;
      max-width: 260px;
      flex: 1 1 220px;
      background: var(--p-surface-900);
      border-radius: 10px;
      border: 1px solid var(--p-surface-700);
      overflow: hidden;
      gap: 8px;
      padding: 10px;
      scroll-snap-align: start;
    }

    .skeleton-col-header {
      height: 20px;
      border-radius: 4px;
      background: var(--p-surface-700);
      animation: shimmer 1.4s infinite;
    }

    .skeleton-card {
      height: 64px;
      border-radius: 8px;
      background: var(--p-surface-800);
      animation: shimmer 1.4s infinite;
    }
    .skeleton-card:nth-child(2) { animation-delay: 0.15s; }
    .skeleton-card:nth-child(3) { animation-delay: 0.3s; }

    @keyframes shimmer {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    @media (max-width: 768px) {
      .board-columns { padding: 10px 10px; gap: 8px; }
    }

    /* CDK drag animations */
    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
  `,
})
export class BoardComponent implements OnInit {
  private readonly api = inject(KanbanApiService);
  private readonly sse = inject(KanbanSseService);
  private readonly messageService = inject(MessageService);
  readonly projectService = inject(ProjectService);

  readonly ALL_STATES = ALL_STATES;

  readonly tasks = signal<TaskOut[]>([]);
  readonly loading = signal(false);
  readonly showNewTaskDialog = signal(false);

  /** Tasks grouped by state, computed from the flat list */
  private readonly tasksByState = computed(() => {
    const map = new Map<TaskState, TaskOut[]>();
    for (const s of ALL_STATES) map.set(s, []);
    for (const t of this.tasks()) {
      map.get(t.state)?.push(t);
    }
    return map;
  });

  columnTasks(state: TaskState): TaskOut[] {
    return this.tasksByState().get(state) ?? [];
  }

  connections(state: TaskState): string[] {
    return COLUMN_CONNECTIONS[state];
  }

  constructor() {
    // Reload tasks whenever the selected project changes
    toObservable(this.projectService.selectedProject)
      .pipe(
        switchMap((project) => {
          this.loading.set(true);
          return this.api.listTasks({ project });
        }),
        takeUntilDestroyed()
      )
      .subscribe({
        next: (tasks) => {
          this.tasks.set(tasks);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Load failed',
            detail: err?.error?.message ?? 'Could not load tasks.',
          });
        },
      });

    // SSE: task created
    this.sse.taskCreated$
      .pipe(takeUntilDestroyed())
      .subscribe((e) => this.tasks.update((list) => [...list, e.payload]));

    // SSE: task updated / task expired (treated the same — replace in list)
    // Preserves depCount/subtaskCount loaded by the REST list endpoint
    this.sse.taskUpdated$
      .pipe(takeUntilDestroyed())
      .subscribe((e) =>
        this.tasks.update((list) =>
          list.map((t) =>
            t.id === e.payload.id
              ? { ...e.payload, depCount: t.depCount, subtaskCount: t.subtaskCount }
              : t
          )
        )
      );

    this.sse.taskExpired$.pipe(takeUntilDestroyed()).subscribe((e) =>
      this.tasks.update((list) =>
        list.map((t) =>
          t.id === e.payload.id
            ? {
                ...t,
                state: TaskState.TODO,
                assignee: null,
                assignedAt: null,
              }
            : t
        )
      )
    );

    // SSE: task deleted
    this.sse.taskDeleted$
      .pipe(takeUntilDestroyed())
      .subscribe((e) =>
        this.tasks.update((list) => list.filter((t) => t.id !== e.payload.id))
      );
  }

  ngOnInit(): void {
    // Initial load is driven by the constructor's toObservable subscription
  }

  handleTransition(event: TaskDropEvent): void {
    const { task, targetState } = event;

    // Client-side guard — server validates too, but this avoids bad requests
    if (!STATE_TRANSITIONS[task.state]?.includes(targetState)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid transition',
        detail: `Cannot move from ${task.state} to ${targetState}`,
        life: 3000,
      });
      return;
    }

    // Optimistic update
    const previous = task.state;
    this.tasks.update((list) =>
      list.map((t) => (t.id === task.id ? { ...t, state: targetState } : t))
    );

    this.api.transitionTask(task.id, targetState).subscribe({
      error: (err) => {
        // Revert on failure
        this.tasks.update((list) =>
          list.map((t) => (t.id === task.id ? { ...t, state: previous } : t))
        );
        this.messageService.add({
          severity: 'error',
          summary: 'Transition failed',
          detail: err?.error?.message ?? 'Could not update task state',
          life: 4000,
        });
      },
    });
  }

  onTaskCreated(task: TaskOut): void {
    this.tasks.update((list) => [...list, task]);
    this.messageService.add({
      severity: 'success',
      summary: 'Task created',
      detail: task.title,
      life: 3000,
    });
  }
}
