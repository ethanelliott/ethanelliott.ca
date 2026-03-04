import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { switchMap, forkJoin, of, catchError } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { DividerModule } from 'primeng/divider';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageService } from 'primeng/api';
import { KanbanApiService } from '../../services/kanban-api.service';
import { KanbanSseService } from '../../services/kanban-sse.service';
import {
  TaskOut,
  TaskState,
  STATE_TRANSITIONS,
  priorityLabel,
  prioritySeverity,
  TaskPatch,
} from '../../models/task.model';
import { HistoryResponse } from '../../models/history.model';
import { ActivityEntryOut } from '../../models/activity.model';
import { TaskDependencyOut } from '../../models/task-dependency.model';
import { HistoryTimelineComponent } from './history-timeline.component';
import { ActivityFeedComponent } from './activity-feed.component';
import { MarkdownService } from '../../services/markdown.service';

const STATE_ACCENT: Record<TaskState, string> = {
  [TaskState.BACKLOG]: '#64748b',
  [TaskState.TODO]: '#60a5fa',
  [TaskState.IN_PROGRESS]: '#a78bfa',
  [TaskState.BLOCKED]: '#f87171',
  [TaskState.IN_REVIEW]: '#fbbf24',
  [TaskState.DONE]: '#34d399',
};

interface DepTask {
  dep: TaskDependencyOut;
  task: TaskOut | null;
}

@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    InputNumberModule,
    DividerModule,
    SkeletonModule,
    HistoryTimelineComponent,
    ActivityFeedComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="detail-page">
      @if (loading()) {
      <!-- Loading skeleton -->
      <div class="detail-header">
        <p-skeleton width="60px" height="18px" />
        <p-skeleton width="100%" height="28px" styleClass="mt-2" />
        <p-skeleton width="200px" height="14px" styleClass="mt-1" />
      </div>
      } @else if (task(); as t) {
      <!-- ── Header ─────────────────────────────────────── -->
      <div class="detail-header">
        <!-- Back + meta row -->
        <div class="header-meta">
          <button class="back-btn" type="button" (click)="goBack()">
            <i class="pi pi-arrow-left"></i> Back
          </button>
          @if (!confirmingDelete()) {
          <button
            class="delete-btn"
            type="button"
            title="Delete task"
            (click)="confirmingDelete.set(true)"
          >
            <i class="pi pi-trash"></i>
          </button>
          } @else {
          <span class="delete-confirm">
            Delete this task?
            <button
              class="delete-confirm-yes"
              type="button"
              [disabled]="deleting()"
              (click)="deleteTask(t)"
            >
              {{ deleting() ? 'Deleting…' : 'Yes, delete' }}
            </button>
            <button
              class="delete-confirm-no"
              type="button"
              [disabled]="deleting()"
              (click)="confirmingDelete.set(false)"
            >
              Cancel
            </button>
          </span>
          }
          <span
            class="state-badge"
            [style.color]="stateColor(t.state)"
            [style.background]="stateColor(t.state) + '22'"
          >
            {{ t.state.replace('_', ' ') }}
          </span>
          <span class="project-chip">{{ t.project }}</span>
          <span class="task-id">{{ t.id.slice(0, 8) }}</span>
        </div>

        <!-- Title — click to edit -->
        @if (editingTitle()) {
        <input
          pInputText
          class="title-input"
          [(ngModel)]="titleDraft"
          (blur)="saveTitle(t)"
          (keydown.enter)="saveTitle(t)"
          (keydown.escape)="editingTitle.set(false)"
          autofocus
        />
        } @else {
        <h1
          class="task-title"
          (click)="startEditTitle(t)"
          title="Click to edit"
        >
          {{ t.title }}
          <i class="pi pi-pencil edit-hint"></i>
        </h1>
        }

        <!-- Description — click to edit -->
        @if (editingDesc()) {
        <textarea
          pTextarea
          class="desc-input"
          [(ngModel)]="descDraft"
          rows="4"
          (blur)="saveDesc(t)"
          (keydown.escape)="editingDesc.set(false)"
          autofocus
        ></textarea>
        } @else {
        <div
          class="task-desc md-content"
          [innerHTML]="md.render(t.description || '*(no description)*')"
          (click)="startEditDesc(t)"
          title="Click to edit"
        ></div>
        }

        <!-- Details row -->
        <div class="details-row">
          <span class="detail-chip" [class]="'p-' + pSeverity(t)">
            {{ pLabel(t) }}
          </span>
          @if (editingPriority()) {
          <p-inputNumber
            [(ngModel)]="priorityDraft"
            [min]="1"
            [max]="9999"
            [showButtons]="true"
            (onBlur)="savePriority(t)"
            styleClass="priority-input"
          />
          } @else {
          <span
            class="detail-chip priority-chip"
            (click)="startEditPriority(t)"
            title="Click to edit priority"
          >
            Priority: {{ t.priority }} <i class="pi pi-pencil edit-hint"></i>
          </span>
          } @if (t.assignee) {
          <span class="detail-chip assignee-chip">👤 {{ t.assignee }}</span>
          }
          <span class="detail-chip ts-chip" title="Created at">
            Created {{ fmtRelative(t.createdAt) }}
          </span>
          <span class="detail-chip ts-chip" title="Updated at">
            Updated {{ fmtRelative(t.updatedAt) }}
          </span>
        </div>

        <!-- Transition buttons -->
        @if (validTransitions(t).length > 0) {
        <div class="transition-row">
          @for (target of validTransitions(t); track target) {
          <button
            class="transition-btn"
            type="button"
            [style.border-color]="stateColor(target)"
            [style.color]="stateColor(target)"
            [disabled]="transitioning()"
            (click)="transition(t, target)"
          >
            → {{ target.replace('_', ' ') }}
          </button>
          }
        </div>
        }
      </div>

      <!-- ── Body ───────────────────────────────────────── -->
      <div class="detail-body">
        <!-- Left: Activity -->
        <section class="body-section activity-section">
          <div class="section-title">Activity</div>
          <app-activity-feed
            [taskId]="t.id"
            [entries]="activity()"
            [loading]="activityLoading()"
            (commented)="onComment($event)"
          />
        </section>

        <!-- Right: History + Deps + Subtasks -->
        <aside class="body-aside">
          <!-- History timeline -->
          <section class="body-section">
            <div class="section-title">State History</div>
            @if (history(); as h) {
            <app-history-timeline [history]="h" />
            } @else {
            <p-skeleton height="120px" />
            }
          </section>

          <p-divider />

          <!-- Dependencies -->
          <section class="body-section">
            <div class="section-title-row">
              <span class="section-title">Dependencies</span>
              <span class="section-count">{{ deps().length }}</span>
            </div>

            @for (item of deps(); track item.dep.id) {
            <div class="dep-row">
              <span
                class="dep-state"
                [style.color]="
                  stateColor(item.task?.state ?? TaskState.BACKLOG)
                "
                >●</span
              >
              @if (item.task) {
              <a
                class="dep-title"
                [routerLink]="['/tasks', item.task.id]"
                [queryParamsHandling]="'preserve'"
              >
                {{ item.task.title }}
              </a>
              <span
                class="dep-state-label"
                [style.color]="stateColor(item.task.state)"
              >
                {{ item.task.state.replace('_', ' ') }}
              </span>
              } @else {
              <span class="dep-title muted">{{
                item.dep.dependsOnId.slice(0, 8)
              }}</span>
              }
              <button
                class="dep-remove"
                type="button"
                [title]="'Remove dependency'"
                (click)="removeDep(t, item)"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>
            }

            <!-- Add dependency -->
            <div class="add-dep-row">
              @if (addingDep()) {
              <input
                pInputText
                class="add-dep-input"
                [(ngModel)]="depIdDraft"
                placeholder="Task ID or search…"
                (keydown.enter)="addDep(t)"
                (keydown.escape)="addingDep.set(false)"
                autofocus
              />
              <p-button
                icon="pi pi-check"
                size="small"
                [text]="true"
                [disabled]="!depIdDraft.trim()"
                (onClick)="addDep(t)"
              />
              <p-button
                icon="pi pi-times"
                size="small"
                [text]="true"
                severity="secondary"
                (onClick)="addingDep.set(false)"
              />
              } @else {
              <button
                class="add-btn"
                type="button"
                (click)="addingDep.set(true)"
              >
                <i class="pi pi-plus"></i> Add dependency
              </button>
              }
            </div>
          </section>

          <p-divider />

          <!-- Subtasks -->
          <section class="body-section">
            <div class="section-title-row">
              <span class="section-title">Subtasks</span>
              <span class="section-count">{{ subtaskProgress() }}</span>
            </div>

            @if (subtasks().length > 0) {
            <div class="subtask-progress-bar">
              <div
                class="subtask-progress-fill"
                [style.width.%]="subtaskPercent()"
              ></div>
            </div>
            } @for (sub of subtasks(); track sub.id) {
            <div class="subtask-row" (click)="navigateToSubtask(sub.id)">
              <span class="dep-state" [style.color]="stateColor(sub.state)"
                >●</span
              >
              <span class="subtask-title">{{ sub.title }}</span>
              <span
                class="dep-state-label"
                [style.color]="stateColor(sub.state)"
              >
                {{ sub.state.replace('_', ' ') }}
              </span>
            </div>
            }

            <!-- Quick-create subtask -->
            <div class="add-dep-row">
              @if (addingSubtask()) {
              <input
                pInputText
                class="add-dep-input"
                [(ngModel)]="subtaskTitleDraft"
                placeholder="Subtask title…"
                (keydown.enter)="addSubtask(t)"
                (keydown.escape)="addingSubtask.set(false)"
                autofocus
              />
              <p-button
                icon="pi pi-check"
                size="small"
                [text]="true"
                [disabled]="!subtaskTitleDraft.trim()"
                (onClick)="addSubtask(t)"
              />
              <p-button
                icon="pi pi-times"
                size="small"
                [text]="true"
                severity="secondary"
                (onClick)="addingSubtask.set(false)"
              />
              } @else {
              <button
                class="add-btn"
                type="button"
                (click)="addingSubtask.set(true)"
              >
                <i class="pi pi-plus"></i> Add subtask
              </button>
              }
            </div>
          </section>
        </aside>
      </div>
      } @else if (!loading()) {
      <div class="not-found">Task not found.</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: auto;
    }

    .detail-page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }

    /* ── Header ─────────────────────────────────────────── */
    .detail-header {
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .header-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .back-btn {
      background: transparent;
      border: 1px solid var(--p-surface-600);
      border-radius: 6px;
      color: var(--p-text-muted-color);
      font-size: 0.78rem;
      padding: 3px 10px;
      cursor: pointer;
      transition: all 0.12s;
      display: flex;
      align-items: center;
      gap: 5px;

      &:hover {
        background: var(--p-surface-700);
        color: var(--p-text-color);
      }
    }

    .delete-btn {
      background: transparent;
      border: 1px solid var(--p-surface-600);
      border-radius: 6px;
      color: var(--p-text-muted-color);
      font-size: 0.78rem;
      padding: 3px 8px;
      cursor: pointer;
      transition: all 0.12s;
      display: flex;
      align-items: center;
      margin-left: auto;

      &:hover {
        background: color-mix(in srgb, #f87171 15%, transparent);
        border-color: #f87171;
        color: #f87171;
      }
    }

    .delete-confirm {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      font-size: 0.78rem;
      color: #f87171;

      button {
        font-size: 0.75rem;
        padding: 3px 10px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid;
        transition: all 0.12s;
        &:disabled { opacity: 0.5; cursor: not-allowed; }
      }

      .delete-confirm-yes {
        background: #f87171;
        border-color: #f87171;
        color: #fff;
        &:hover:not(:disabled) { background: #ef4444; border-color: #ef4444; }
      }

      .delete-confirm-no {
        background: transparent;
        border-color: var(--p-surface-600);
        color: var(--p-text-muted-color);
        &:hover:not(:disabled) { background: var(--p-surface-700); color: var(--p-text-color); }
      }
    }

    .state-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .project-chip {
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
      color: var(--p-primary-color);
      font-weight: 500;
    }

    .task-id {
      font-size: 0.68rem;
      color: var(--p-text-muted-color);
      font-family: monospace;
      background: var(--p-surface-800);
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* Edit-in-place title */
    .task-title {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--p-text-color);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 4px;
      padding: 2px 4px;
      transition: background 0.12s;

      &:hover {
        background: var(--p-surface-800);
        .edit-hint { opacity: 1; }
      }
    }

    .title-input {
      font-size: 1.2rem;
      width: 100%;
    }

    .task-desc {
      margin: 0;
      font-size: 0.875rem;
      color: var(--p-text-muted-color);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      transition: background 0.12s;
      word-break: break-word;

      &:hover {
        background: var(--p-surface-800);
      }
    }

    .task-desc.md-content :is(p, ul, ol, blockquote, h1, h2, h3, h4) {
      margin: 0 0 8px;
    }
    .task-desc.md-content :is(p, ul, ol):last-child {
      margin-bottom: 0;
    }
    .task-desc.md-content pre {
      margin: 8px 0;
      border-radius: 6px;
      overflow-x: auto;
    }
    .task-desc.md-content code:not(pre code) {
      background: var(--p-surface-700);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.8rem;
    }
    .task-desc.md-content a {
      color: var(--p-primary-color);
    }
    .task-desc.md-content blockquote {
      border-left: 3px solid var(--p-surface-500);
      padding-left: 12px;
      color: var(--p-text-muted-color);
    }

    .desc-input {
      width: 100%;
      font-size: 0.875rem;
    }

    .edit-hint {
      font-size: 0.65rem;
      opacity: 0;
      color: var(--p-text-muted-color);
      transition: opacity 0.12s;
    }

    /* Details row */
    .details-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .detail-chip {
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--p-surface-700);
      color: var(--p-text-muted-color);

      &.p-danger    { background: #ef444422; color: #f87171; font-weight: 700; }
      &.p-warn      { background: #f59e0b22; color: #fbbf24; font-weight: 700; }
      &.p-info      { background: #3b82f622; color: #60a5fa; font-weight: 700; }
      &.p-secondary { font-weight: 700; }

      &.priority-chip { cursor: pointer; &:hover { background: var(--p-surface-600); } }
      &.assignee-chip { color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 18%, transparent); }
    }

    :host ::ng-deep .priority-input {
      width: 110px;

      input { font-size: 0.8rem; height: 28px; padding: 2px 6px; }
    }

    .ts-chip {
      font-size: 0.68rem;
    }

    /* Transition buttons */
    .transition-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .transition-btn {
      background: transparent;
      border: 1px solid;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 5px 14px;
      cursor: pointer;
      transition: all 0.12s;

      &:hover:not(:disabled) {
        opacity: 0.8;
        transform: translateY(-1px);
      }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    /* ── Body ───────────────────────────────────────────── */
    .detail-body {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 16px;
      align-items: flex-start;
    }

    .body-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .activity-section {
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
      padding: 16px;
    }

    .body-aside {
      display: flex;
      flex-direction: column;
      gap: 0;
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 12px;
      padding: 16px;
    }

    .section-title {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--p-text-muted-color);
    }

    .section-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .section-count {
      font-size: 0.68rem;
      background: var(--p-surface-700);
      color: var(--p-text-muted-color);
      padding: 1px 6px;
      border-radius: 8px;
    }

    /* Deps / subtasks rows */
    .dep-row,
    .subtask-row {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 5px 2px;
      border-radius: 5px;
      transition: background 0.1s;

      &:hover { background: var(--p-surface-800); }
    }

    .subtask-row { cursor: pointer; }

    .dep-state {
      font-size: 0.9rem;
      flex-shrink: 0;
      line-height: 1;
    }

    .dep-title {
      flex: 1;
      font-size: 0.8rem;
      color: var(--p-text-color);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;

      &:hover { text-decoration: underline; }
      &.muted { color: var(--p-text-muted-color); }
    }

    .subtask-title {
      flex: 1;
      font-size: 0.8rem;
      color: var(--p-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dep-state-label {
      font-size: 0.65rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .dep-remove {
      background: transparent;
      border: none;
      color: var(--p-text-muted-color);
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 0.7rem;
      opacity: 0;
      transition: opacity 0.1s, color 0.1s;

      :is(.dep-row):hover & { opacity: 1; }
      &:hover { color: #f87171; }
    }

    /* Subtask progress bar */
    .subtask-progress-bar {
      height: 4px;
      background: var(--p-surface-700);
      border-radius: 2px;
      overflow: hidden;
    }

    .subtask-progress-fill {
      height: 100%;
      background: #34d399;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    /* Add dep/subtask row */
    .add-dep-row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding-top: 4px;
    }

    .add-dep-input {
      flex: 1;
      font-size: 0.8rem;
      height: 30px;
    }

    .add-btn {
      background: transparent;
      border: 1px dashed var(--p-surface-600);
      border-radius: 6px;
      color: var(--p-text-muted-color);
      font-size: 0.75rem;
      padding: 4px 10px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.12s;

      &:hover {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
      }
    }

    .not-found {
      padding: 2rem;
      color: var(--p-text-muted-color);
      text-align: center;
    }

    /* Responsive */
    @media (max-width: 860px) {
      .detail-body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class TaskDetailComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(KanbanApiService);
  private readonly sse = inject(KanbanSseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly messageService = inject(MessageService);
  readonly md = inject(MarkdownService);

  readonly TaskState = TaskState;

  readonly task = signal<TaskOut | null>(null);
  readonly loading = signal(true);
  readonly transitioning = signal(false);
  readonly history = signal<HistoryResponse | null>(null);
  readonly activity = signal<ActivityEntryOut[]>([]);
  readonly activityLoading = signal(false);
  readonly deps = signal<DepTask[]>([]);
  readonly subtasks = signal<TaskOut[]>([]);

  // Edit-in-place state
  readonly editingTitle = signal(false);
  readonly editingDesc = signal(false);
  readonly editingPriority = signal(false);
  titleDraft = '';
  descDraft = '';
  priorityDraft = 0;

  // Dep / subtask add state
  readonly addingDep = signal(false);
  readonly addingSubtask = signal(false);
  readonly confirmingDelete = signal(false);
  readonly deleting = signal(false);
  depIdDraft = '';
  subtaskTitleDraft = '';

  readonly subtaskProgress = computed(() => {
    const subs = this.subtasks();
    const done = subs.filter((s) => s.state === TaskState.DONE).length;
    return `${done} / ${subs.length}`;
  });

  readonly subtaskPercent = computed(() => {
    const subs = this.subtasks();
    if (subs.length === 0) return 0;
    return Math.round(
      (subs.filter((s) => s.state === TaskState.DONE).length / subs.length) *
        100
    );
  });

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const id = params.get('id') ?? '';
          this.loading.set(true);
          return this.api.getTask(id);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (task) => {
          this.task.set(task);
          this.loading.set(false);
          this.loadRelated(task.id);
        },
        error: () => {
          this.loading.set(false);
          this.task.set(null);
        },
      });

    // SSE: update task in place if it's the one we're viewing
    this.sse.taskUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        if (this.task()?.id === e.payload.id) {
          this.task.set(e.payload);
        }
      });

    // SSE: live-append activity entries for the current task
    this.sse.activityAdded$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        if (this.task()?.id === e.payload.taskId) {
          this.activity.update((list) => [...list, e.payload]);
        }
      });
  }

  private loadRelated(id: string): void {
    // History
    this.api.getTaskHistory(id).subscribe({
      next: (h) => this.history.set(h),
    });

    // Activity
    this.activityLoading.set(true);
    this.api.getTaskActivity(id).subscribe({
      next: (a) => {
        this.activity.set(a);
        this.activityLoading.set(false);
      },
      error: () => this.activityLoading.set(false),
    });

    // Dependencies — load dep list, then enrich each with task details
    this.api.getTaskDependencies(id).subscribe({
      next: (depList) => {
        if (depList.length === 0) {
          this.deps.set([]);
          return;
        }
        forkJoin(
          depList.map((dep) =>
            this.api
              .getTask(dep.dependsOnId)
              .pipe(catchError(() => of(null)))
              .pipe(switchMap((t) => of({ dep, task: t as TaskOut | null })))
          )
        ).subscribe({ next: (items) => this.deps.set(items) });
      },
    });

    // Subtasks
    this.api.getSubtasks(id).subscribe({
      next: (subs) => this.subtasks.set(subs),
    });
  }

  validTransitions(t: TaskOut): TaskState[] {
    return STATE_TRANSITIONS[t.state] ?? [];
  }

  transition(t: TaskOut, target: TaskState): void {
    this.transitioning.set(true);
    const prev = t.state;
    this.task.update((cur) => (cur ? { ...cur, state: target } : cur));

    this.api.transitionTask(t.id, target).subscribe({
      next: (updated) => {
        this.task.set(updated);
        this.transitioning.set(false);
        this.loadRelated(updated.id);
      },
      error: (err) => {
        this.task.update((cur) => (cur ? { ...cur, state: prev } : cur));
        this.transitioning.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Transition failed',
          detail: err?.error?.message ?? 'Could not update task state',
          life: 4000,
        });
      },
    });
  }

  startEditTitle(t: TaskOut): void {
    this.titleDraft = t.title;
    this.editingTitle.set(true);
  }

  saveTitle(t: TaskOut): void {
    if (!this.titleDraft.trim() || this.titleDraft === t.title) {
      this.editingTitle.set(false);
      return;
    }
    this.patchTask(t.id, { title: this.titleDraft.trim() });
    this.editingTitle.set(false);
  }

  startEditDesc(t: TaskOut): void {
    this.descDraft = t.description;
    this.editingDesc.set(true);
  }

  saveDesc(t: TaskOut): void {
    if (this.descDraft === t.description) {
      this.editingDesc.set(false);
      return;
    }
    this.patchTask(t.id, { description: this.descDraft });
    this.editingDesc.set(false);
  }

  startEditPriority(t: TaskOut): void {
    this.priorityDraft = t.priority;
    this.editingPriority.set(true);
  }

  savePriority(t: TaskOut): void {
    if (this.priorityDraft === t.priority) {
      this.editingPriority.set(false);
      return;
    }
    this.patchTask(t.id, { priority: this.priorityDraft });
    this.editingPriority.set(false);
  }

  private patchTask(id: string, patch: TaskPatch): void {
    this.api.patchTask(id, patch).subscribe({
      next: (updated) => this.task.set(updated),
      error: (err) =>
        this.messageService.add({
          severity: 'error',
          summary: 'Save failed',
          detail: err?.error?.message ?? 'Could not save changes.',
          life: 4000,
        }),
    });
  }

  addDep(t: TaskOut): void {
    if (!this.depIdDraft.trim()) return;
    this.api.addDependency(t.id, this.depIdDraft.trim()).subscribe({
      next: (dep) => {
        this.depIdDraft = '';
        this.addingDep.set(false);
        // Load the task info for the new dep
        this.api.getTask(dep.dependsOnId).subscribe({
          next: (depTask) =>
            this.deps.update((d) => [...d, { dep, task: depTask }]),
          error: () => this.deps.update((d) => [...d, { dep, task: null }]),
        });
      },
      error: (err) =>
        this.messageService.add({
          severity: 'error',
          summary: 'Add dependency failed',
          detail: err?.error?.message ?? 'Could not add dependency.',
          life: 4000,
        }),
    });
  }

  removeDep(t: TaskOut, item: DepTask): void {
    this.api.removeDependency(t.id, item.dep.dependsOnId).subscribe({
      next: () =>
        this.deps.update((d) => d.filter((i) => i.dep.id !== item.dep.id)),
      error: (err) =>
        this.messageService.add({
          severity: 'error',
          summary: 'Remove failed',
          detail: err?.error?.message ?? 'Could not remove dependency.',
          life: 4000,
        }),
    });
  }

  addSubtask(t: TaskOut): void {
    if (!this.subtaskTitleDraft.trim()) return;
    this.api
      .createTask({
        title: this.subtaskTitleDraft.trim(),
        description: '',
        project: t.project,
        parentId: t.id,
      })
      .subscribe({
        next: (sub) => {
          this.subtaskTitleDraft = '';
          this.addingSubtask.set(false);
          this.subtasks.update((s) => [...s, sub]);
        },
        error: (err) =>
          this.messageService.add({
            severity: 'error',
            summary: 'Create failed',
            detail: err?.error?.message ?? 'Could not create subtask.',
            life: 4000,
          }),
      });
  }

  navigateToSubtask(id: string): void {
    this.router.navigate(['/tasks', id], { queryParamsHandling: 'preserve' });
  }

  onComment(entry: ActivityEntryOut): void {
    this.activity.update((a) => [...a, entry]);
  }

  stateColor(state: TaskState): string {
    return STATE_ACCENT[state] ?? '#94a3b8';
  }

  pLabel(t: TaskOut): string {
    return priorityLabel(t.priority);
  }

  pSeverity(t: TaskOut): string {
    return prioritySeverity(t.priority);
  }

  fmtRelative(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  goBack(): void {
    this.location.back();
  }

  deleteTask(t: TaskOut): void {
    this.deleting.set(true);
    this.api.deleteTask(t.id).subscribe({
      next: () => this.router.navigate(['/board']),
      error: (err) => {
        this.deleting.set(false);
        this.confirmingDelete.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Delete failed',
          detail: err?.error?.message ?? 'Could not delete task.',
          life: 4000,
        });
      },
    });
  }
}
