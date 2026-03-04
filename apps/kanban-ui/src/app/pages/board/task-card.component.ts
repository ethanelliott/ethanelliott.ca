import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CdkDrag, CdkDragPlaceholder } from '@angular/cdk/drag-drop';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import { toSignal } from '@angular/core/rxjs-interop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import {
  TaskOut,
  TaskState,
  STATE_TRANSITIONS,
  priorityLabel,
  prioritySeverity,
} from '../../models/task.model';

/** 30 min assumed TTL — used only for elapsed-time colour thresholds */
const TTL_MS = 30 * 60 * 1000;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [
    CommonModule,
    CdkDrag,
    CdkDragPlaceholder,
    TagModule,
    TooltipModule,
    ButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task-card-host' },
  template: `
    <div class="task-card" cdkDrag [cdkDragData]="task()" (click)="navigate()">
      <!-- Drag preview placeholder -->
      <div class="drag-placeholder" *cdkDragPlaceholder></div>

      <!-- Priority + title row -->
      <div class="card-header">
        <p-tag
          [value]="pLabel()"
          [severity]="pSeverity()"
          styleClass="priority-tag"
        />
        <span class="card-title" [title]="task().title">{{
          task().title
        }}</span>
      </div>

      <!-- Meta row -->
      <div class="card-meta">
        @if (task().assignee) {
        <span class="assignee-chip" [pTooltip]="task().assignee!">
          {{ shortName(task().assignee!) }}
        </span>
        }

        <!-- Elapsed ticker for IN_PROGRESS tasks -->
        @if (task().state === TaskState.IN_PROGRESS && task().assignedAt) {
        <span
          class="elapsed-badge"
          [class]="'severity-' + staleSeverity()"
          [pTooltip]="'Assigned at ' + task().assignedAt"
        >
          ⏱ {{ elapsedLabel() }}
        </span>
        }

        <!-- Dependency count -->
        @if ((task().depCount ?? 0) > 0) {
        <span class="meta-chip dep-chip" [pTooltip]="task().depCount + ' dependencies'">
          🔗 {{ task().depCount }}
        </span>
        }

        <!-- Subtask count -->
        @if ((task().subtaskCount ?? 0) > 0) {
        <span class="meta-chip sub-chip" [pTooltip]="task().subtaskCount + ' subtasks'">
          📋 {{ task().subtaskCount }}
        </span>
        }
      </div>

      <!-- Quick-action overlay (shown on hover) -->
      <div class="quick-actions" (click)="$event.stopPropagation()">
        <button
          class="qa-btn"
          type="button"
          pTooltip="View detail"
          tooltipPosition="top"
          (click)="navigate()"
        >
          <i class="pi pi-arrow-right"></i>
        </button>

        @for (target of validTransitions(); track target) {
        <button
          class="qa-btn"
          type="button"
          [pTooltip]="'→ ' + target"
          tooltipPosition="top"
          (click)="quickTransition.emit({ task: task(), state: target })"
        >
          {{ stateShort(target) }}
        </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host.task-card-host {
      display: block;
    }

    .task-card {
      position: relative;
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-700);
      border-radius: 8px;
      padding: 10px 12px;
      cursor: grab;
      transition: border-color 0.15s, box-shadow 0.15s;

      &:hover {
        border-color: var(--p-primary-color);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }

      &:hover .quick-actions {
        opacity: 1;
        pointer-events: all;
      }

      &:active { cursor: grabbing; }
    }

    .drag-placeholder {
      background: var(--p-surface-700);
      border: 2px dashed var(--p-primary-color);
      border-radius: 8px;
      min-height: 62px;
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 6px;
    }

    :host ::ng-deep .priority-tag {
      font-size: 0.65rem;
      padding: 1px 5px;
      flex-shrink: 0;
    }

    .card-title {
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--p-text-color);
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .assignee-chip {
      font-size: 0.68rem;
      padding: 1px 6px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
      color: var(--p-primary-color);
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .elapsed-badge {
      font-size: 0.68rem;
      padding: 1px 6px;
      border-radius: 10px;
      font-variant-numeric: tabular-nums;

      &.severity-success { background: #22c55e22; color: #4ade80; }
      &.severity-warn    { background: #f59e0b22; color: #fbbf24; }
      &.severity-danger  { background: #ef444422; color: #f87171; animation: pulse 1s infinite; }
    }

    .meta-chip {
      font-size: 0.65rem;
      padding: 1px 5px;
      border-radius: 8px;
      white-space: nowrap;
    }
    .dep-chip { background: #fbbf2422; color: #fbbf24; }
    .sub-chip { background: #34d39922; color: #34d399; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Quick actions */
    .quick-actions {
      position: absolute;
      bottom: -1px;
      right: -1px;
      display: flex;
      gap: 3px;
      background: var(--p-surface-800);
      border: 1px solid var(--p-primary-color);
      border-radius: 0 0 8px 0;
      padding: 3px 5px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
    }

    .qa-btn {
      background: transparent;
      border: 1px solid var(--p-surface-600);
      border-radius: 4px;
      color: var(--p-text-muted-color);
      font-size: 0.65rem;
      padding: 1px 4px;
      cursor: pointer;
      transition: all 0.1s;
      white-space: nowrap;

      &:hover {
        background: var(--p-primary-color);
        color: #fff;
        border-color: var(--p-primary-color);
      }
    }

    /* CDK drag styles */
    .cdk-drag-preview {
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      opacity: 0.9;
    }

    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0,0,0.2,1);
    }
  `,
})
export class TaskCardComponent {
  private readonly router = inject(Router);

  readonly task = input.required<TaskOut>();
  readonly quickTransition = output<{ task: TaskOut; state: TaskState }>();

  readonly TaskState = TaskState;

  // Tick every second — only meaningful for IN_PROGRESS cards
  private readonly _tick = toSignal(interval(1000).pipe(takeUntilDestroyed()), {
    initialValue: 0,
  });

  readonly elapsedMs = computed(() => {
    this._tick(); // depend on tick to re-evaluate every second
    const at = this.task().assignedAt;
    return at ? Date.now() - new Date(at).getTime() : 0;
  });

  readonly elapsedLabel = computed(() => formatElapsed(this.elapsedMs()));

  readonly staleSeverity = computed(() => {
    const ratio = this.elapsedMs() / TTL_MS;
    if (ratio >= 0.9) return 'danger';
    if (ratio >= 0.5) return 'warn';
    return 'success';
  });

  readonly pLabel = computed(() => priorityLabel(this.task().priority));
  readonly pSeverity = computed(() => prioritySeverity(this.task().priority));

  readonly validTransitions = computed(
    () => STATE_TRANSITIONS[this.task().state] ?? []
  );

  navigate(): void {
    this.router.navigate(['/tasks', this.task().id], {
      queryParamsHandling: 'preserve',
    });
  }

  shortName(name: string): string {
    // Abbreviate long agent names: "agent-copilot-1" → "agent-1"
    return name.length > 12 ? name.slice(0, 10) + '…' : name;
  }

  stateShort(state: TaskState): string {
    const map: Record<TaskState, string> = {
      [TaskState.BACKLOG]: 'BL',
      [TaskState.TODO]: 'TD',
      [TaskState.IN_PROGRESS]: 'IP',
      [TaskState.BLOCKED]: 'BK',
      [TaskState.IN_REVIEW]: 'IR',
      [TaskState.DONE]: 'DN',
    };
    return map[state] ?? state.slice(0, 2);
  }
}
