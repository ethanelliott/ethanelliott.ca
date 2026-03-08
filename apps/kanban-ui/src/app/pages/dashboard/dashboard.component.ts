import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { SkeletonModule } from 'primeng/skeleton';
import { KanbanApiService } from '../../services/kanban-api.service';
import { KanbanSseService } from '../../services/kanban-sse.service';
import { ProjectService } from '../../services/project.service';
import {
  TaskOut,
  TaskState,
  ALL_STATES,
  priorityLabel,
} from '../../models/task.model';
import {
  ActivityEntryOut,
  ActivityEntryType,
} from '../../models/activity.model';
import { AgentCardComponent } from './agent-card.component';
import { QueuePanelComponent } from './queue-panel.component';

const STATE_LABELS: Record<TaskState, string> = {
  [TaskState.BACKLOG]: 'Backlog',
  [TaskState.TODO]: 'Todo',
  [TaskState.IN_PROGRESS]: 'In Progress',
  [TaskState.BLOCKED]: 'Blocked',
  [TaskState.IN_REVIEW]: 'In Review',
  [TaskState.CHANGES_REQUESTED]: 'Changes Requested',
  [TaskState.DONE]: 'Done',
};

const STATE_ACCENT: Record<TaskState, string> = {
  [TaskState.BACKLOG]: '#64748b',
  [TaskState.TODO]: '#60a5fa',
  [TaskState.IN_PROGRESS]: '#a78bfa',
  [TaskState.BLOCKED]: '#f87171',
  [TaskState.IN_REVIEW]: '#fbbf24',
  [TaskState.CHANGES_REQUESTED]: '#f97316',
  [TaskState.DONE]: '#34d399',
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    SkeletonModule,
    AgentCardComponent,
    QueuePanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dashboard-page">
      <!-- Page header -->
      <div class="dash-header">
        <h2 class="dash-title">
          Dashboard @if (projectService.selectedProject(); as p) {
          <span class="project-chip">{{ p }}</span>
          }
        </h2>
        @if (loading()) {
        <span class="loading-label">
          <i class="pi pi-spin pi-spinner"></i> Loading…
        </span>
        }
      </div>

      <!-- Stat cards (skeleton while loading) -->
      <div class="stat-row">
        @if (loading()) { @for (i of [0,1,2,3,4,5]; track i) {
        <div class="stat-card stat-skeleton">
          <p-skeleton width="60px" height="12px" />
          <p-skeleton width="40px" height="24px" styleClass="mt-1" />
        </div>
        } } @else { @for (state of ALL_STATES; track state) {
        <div
          class="stat-card"
          [style.--accent]="accent(state)"
          (click)="filterState.set(filterState() === state ? null : state)"
          [class.active]="filterState() === state"
        >
          <span class="stat-label">{{ stateLabel(state) }}</span>
          <span class="stat-value">{{ countByState(state) }}</span>
        </div>
        } }
      </div>

      <!-- Main panels row -->
      <div class="dash-body">
        <!-- Active agents -->
        <section class="dash-panel agents-panel">
          <div class="panel-header">
            <span class="panel-title">Active Agents</span>
            <span class="panel-count">
              {{ activeAgents().length }}
              @if (totalAgentSlots() > 0) { / {{ totalAgentSlots() }} }
            </span>
          </div>

          <div class="panel-body">
            @if (activeAgents().length === 0) {
            <div class="empty-agents">
              <i
                class="pi pi-check-circle"
                style="font-size:2rem;color:var(--p-surface-600)"
              ></i>
              <p>No agents working right now.</p>
            </div>
            } @for (task of activeAgents(); track task.id) {
            <app-agent-card
              [task]="task"
              [latestComment]="latestComments().get(task.id) ?? null"
            />
            }
          </div>
        </section>

        <!-- Queue panel -->
        <section class="dash-panel queue-panel-wrap">
          <div class="panel-header">
            <span class="panel-title">Upcoming Queue</span>
          </div>
          <div class="panel-body">
            <app-queue-panel [tasks]="visibleTasks()" />
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .dashboard-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    /* Header */
    .dash-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 52px;
      padding: 0 20px;
      flex-shrink: 0;
      border-bottom: 1px solid var(--p-surface-700);
    }

    .dash-title {
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

    .loading-label {
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Stat row */
    .stat-row {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      flex-shrink: 0;
      overflow-x: auto;
    }

    .stat-card {
      flex: 1 1 80px;
      min-width: 72px;
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-top: 3px solid var(--accent, var(--p-surface-500));
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
      user-select: none;

      &:hover {
        border-color: var(--accent);
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }

      &.active {
        background: color-mix(in srgb, var(--accent) 10%, var(--p-surface-800));
        border-color: var(--accent);
      }
    }

    .stat-label {
      display: block;
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--p-text-muted-color);
      margin-bottom: 4px;
    }

    .stat-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--p-text-color);
      line-height: 1;
    }

    .stat-skeleton {
      cursor: default;
      pointer-events: none;
      border-top-color: var(--p-surface-600);
    }

    /* Main body */
    .dash-body {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 12px;
      padding: 0 16px 16px;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .dash-panel {
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--p-surface-700);
      flex-shrink: 0;
    }

    .panel-title {
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--p-text-muted-color);
    }

    .panel-count {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--p-primary-color);
    }

    .panel-body {
      padding: 12px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .empty-agents {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 32px 16px;
      color: var(--p-text-muted-color);
      font-size: 0.85rem;
      text-align: center;

      p { margin: 0; }
    }

    /* Responsive */
    @media (max-width: 900px) {
      .dash-body {
        grid-template-columns: 1fr;
        overflow-y: auto;
      }
    }
  `,
})
export class DashboardComponent {
  private readonly api = inject(KanbanApiService);
  private readonly sse = inject(KanbanSseService);
  private readonly messageService = inject(MessageService);
  readonly projectService = inject(ProjectService);

  readonly ALL_STATES = ALL_STATES;

  readonly tasks = signal<TaskOut[]>([]);
  readonly loading = signal(false);
  /** Null = no filter active */
  readonly filterState = signal<TaskState | null>(null);

  /** Latest COMMENT activity per task id — fed by SSE activity_added events */
  readonly latestComments = signal<Map<string, ActivityEntryOut>>(new Map());

  /** IN_PROGRESS tasks with an assignee — one row per agent */
  readonly activeAgents = computed(() =>
    this.tasks()
      .filter((t) => t.state === TaskState.IN_PROGRESS && t.assignee)
      .sort((a, b) => {
        // Stale tasks (oldest) first
        const aT = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
        const bT = b.assignedAt ? new Date(b.assignedAt).getTime() : 0;
        return aT - bT;
      })
  );

  /** Tasks visible in the queue panel, optionally filtered by stat card click */
  readonly visibleTasks = computed(() => {
    const f = this.filterState();
    return f ? this.tasks().filter((t) => t.state === f) : this.tasks();
  });

  /** Total agent "slots" = IN_PROGRESS count including unassigned */
  readonly totalAgentSlots = computed(
    () => this.tasks().filter((t) => t.state === TaskState.IN_PROGRESS).length
  );

  private readonly countMap = computed(() => {
    const m = new Map<TaskState, number>();
    for (const s of ALL_STATES) m.set(s, 0);
    for (const t of this.tasks()) m.set(t.state, (m.get(t.state) ?? 0) + 1);
    return m;
  });

  countByState(state: TaskState): number {
    return this.countMap().get(state) ?? 0;
  }

  stateLabel(state: TaskState): string {
    return STATE_LABELS[state];
  }

  accent(state: TaskState): string {
    return STATE_ACCENT[state];
  }

  constructor() {
    // Reload when project changes
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
          // Seed latest comments for active agents
          this._loadLatestComments(tasks);
        },
        error: (err) => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Load failed',
            detail:
              err?.error?.message ??
              'Could not load tasks. Retrying on next update.',
          });
        },
      });

    // SSE live updates
    this.sse.taskCreated$
      .pipe(takeUntilDestroyed())
      .subscribe((e) => this.tasks.update((list) => [...list, e.payload]));

    this.sse.taskUpdated$
      .pipe(takeUntilDestroyed())
      .subscribe((e) =>
        this.tasks.update((list) =>
          list.map((t) => (t.id === e.payload.id ? e.payload : t))
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

    this.sse.taskDeleted$
      .pipe(takeUntilDestroyed())
      .subscribe((e) =>
        this.tasks.update((list) => list.filter((t) => t.id !== e.payload.id))
      );

    // Track latest COMMENT per task for agent status display
    this.sse.activityAdded$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e.payload.type === ActivityEntryType.COMMENT) {
        this.latestComments.update((m) => {
          const next = new Map(m);
          next.set(e.payload.taskId, e.payload);
          return next;
        });
      }
    });
  }

  /** Fetch the latest COMMENT for each IN_PROGRESS agent task to seed the map */
  private _loadLatestComments(tasks: TaskOut[]): void {
    const active = tasks.filter(
      (t) => t.state === TaskState.IN_PROGRESS && t.assignee
    );
    if (active.length === 0) return;

    const fetches = active.map((t) => this.api.getTaskActivity(t.id));

    forkJoin(fetches).subscribe({
      next: (results) => {
        const m = new Map(this.latestComments());
        for (let i = 0; i < active.length; i++) {
          const entries = results[i];
          // Find the latest COMMENT entry (entries are typically chronological)
          const latest = [...entries]
            .reverse()
            .find((e) => e.type === ActivityEntryType.COMMENT);
          if (latest) {
            m.set(active[i].id, latest);
          }
        }
        this.latestComments.set(m);
      },
    });
  }
}
