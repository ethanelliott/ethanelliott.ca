import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import {
  TaskOut,
  TaskState,
  priorityLabel,
  prioritySeverity,
} from '../../models/task.model';

@Component({
  selector: 'app-queue-panel',
  standalone: true,
  imports: [CommonModule, TagModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="queue-panel">
      <!-- Eligible TODO section -->
      <div class="section-header">
        <span class="section-title">Next Up</span>
        <span class="section-count">{{ eligible().length }} eligible</span>
      </div>

      @if (eligible().length === 0) {
        <div class="empty-state">No tasks ready to be picked up.</div>
      }

      @for (task of eligible(); track task.id; let i = $index) {
        <div class="queue-row" (click)="navigate(task.id)">
          <span class="rank">#{{ i + 1 }}</span>
          <p-tag
            [value]="pLabel(task)"
            [severity]="pSeverity(task)"
            styleClass="small-tag"
          />
          <span class="row-title" [title]="task.title">{{ task.title }}</span>
          <span class="row-age" [pTooltip]="task.createdAt">
            {{ age(task.createdAt) }}
          </span>
        </div>
      }

      <!-- Blocked section -->
      @if (blocked().length > 0) {
        <div class="section-header blocked-header">
          <span class="section-title">Blocked / Waiting</span>
          <span class="section-count">{{ blocked().length }}</span>
        </div>

        @for (task of blocked(); track task.id) {
          <div class="queue-row blocked-row" (click)="navigate(task.id)">
            <span class="block-icon">🔒</span>
            <p-tag
              [value]="pLabel(task)"
              [severity]="pSeverity(task)"
              styleClass="small-tag"
            />
            <span class="row-title" [title]="task.title">{{ task.title }}</span>
            <span class="blocked-label">waiting on deps</span>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .queue-panel {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 2px 4px;
      margin-top: 4px;

      &.blocked-header {
        margin-top: 12px;
        border-top: 1px solid var(--p-surface-700);
        padding-top: 12px;
      }
    }

    .section-title {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--p-text-muted-color);
    }

    .section-count {
      font-size: 0.68rem;
      color: var(--p-text-muted-color);
      background: var(--p-surface-700);
      padding: 1px 6px;
      border-radius: 8px;
    }

    .empty-state {
      font-size: 0.78rem;
      color: var(--p-text-muted-color);
      padding: 12px 4px;
      text-align: center;
    }

    .queue-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 7px;
      cursor: pointer;
      transition: background 0.12s;

      &:hover {
        background: var(--p-surface-800);
      }

      &.blocked-row {
        opacity: 0.85;
      }
    }

    .rank {
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--p-text-muted-color);
      min-width: 24px;
      text-align: right;
    }

    .block-icon {
      font-size: 0.8rem;
      min-width: 20px;
    }

    :host ::ng-deep .small-tag {
      font-size: 0.62rem;
      padding: 1px 5px;
      flex-shrink: 0;
    }

    .row-title {
      flex: 1;
      font-size: 0.8rem;
      color: var(--p-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .row-age {
      font-size: 0.68rem;
      color: var(--p-text-muted-color);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .blocked-label {
      font-size: 0.68rem;
      color: #f87171;
      flex-shrink: 0;
    }
  `,
})
export class QueuePanelComponent {
  private readonly router = inject(Router);

  readonly tasks = input<TaskOut[]>([]);

  /** TODO tasks that have no unsatisfied deps — sorted by priority, then age */
  readonly eligible = computed(() =>
    this.tasks()
      .filter((t) => t.state === TaskState.TODO)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
  );

  readonly blocked = computed(() =>
    this.tasks()
      .filter((t) => t.state === TaskState.BLOCKED)
      .sort((a, b) => a.priority - b.priority)
  );

  pLabel(task: TaskOut): string {
    return priorityLabel(task.priority);
  }

  pSeverity(task: TaskOut): 'danger' | 'warn' | 'info' | 'secondary' {
    return prioritySeverity(task.priority);
  }

  age(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  navigate(id: string): void {
    this.router.navigate(['/tasks', id], { queryParamsHandling: 'preserve' });
  }
}
