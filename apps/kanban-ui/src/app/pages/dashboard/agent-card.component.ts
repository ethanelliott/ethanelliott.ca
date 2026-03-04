import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TooltipModule } from 'primeng/tooltip';
import { toSignal } from '@angular/core/rxjs-interop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import {
  TaskOut,
  priorityLabel,
  prioritySeverity,
} from '../../models/task.model';

/** Assumed TTL: 30 minutes, matching the backend default */
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
  selector: 'app-agent-card',
  standalone: true,
  imports: [CommonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="agent-card"
      [class]="'severity-' + severity()"
      (click)="navigate()"
      [pTooltip]="'View task detail'"
      tooltipPosition="right"
    >
      <!-- Left: icon + agent info -->
      <div class="agent-left">
        <div class="agent-icon" [class]="'severity-' + severity()">
          {{ severity() === 'danger' ? '⚠️' : '🤖' }}
        </div>
        <div class="agent-info">
          <span class="agent-name">{{ task().assignee }}</span>
          <span class="task-title" [title]="task().title">{{
            task().title
          }}</span>
        </div>
      </div>

      <!-- Right: priority + elapsed -->
      <div class="agent-right">
        <span class="priority-badge" [class]="'p-' + pSeverity()">
          {{ pLabel() }}
        </span>
        <span class="elapsed" [class]="'severity-' + severity()">
          {{ elapsedLabel() }}
        </span>
      </div>

      <!-- TTL progress bar -->
      <div class="ttl-bar-wrap">
        <div
          class="ttl-bar"
          [class]="'severity-' + severity()"
          [style.width.%]="ttlPercent()"
        ></div>
      </div>

      <!-- Stale warning banner -->
      @if (severity() === 'danger') {
      <div class="stale-banner">🔴 STALE — pending expiry</div>
      }
    </div>
  `,
  styles: `
    .agent-card {
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-700);
      border-radius: 10px;
      padding: 12px 14px 8px;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
      display: flex;
      flex-direction: column;
      gap: 8px;

      &:hover {
        border-color: var(--p-primary-color);
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      }

      &.severity-danger {
        border-color: #f8717166;
        background: color-mix(in srgb, #ef4444 5%, var(--p-surface-800));
      }

      &.severity-warn {
        border-color: #fbbf2466;
      }
    }

    .agent-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
    }

    .agent-icon {
      font-size: 1.3rem;
      flex-shrink: 0;
      line-height: 1;
    }

    .agent-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }

    .agent-name {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--p-primary-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .task-title {
      font-size: 0.78rem;
      color: var(--p-text-muted-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .agent-right {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .priority-badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;

      &.p-danger    { background: #ef444422; color: #f87171; }
      &.p-warn      { background: #f59e0b22; color: #fbbf24; }
      &.p-info      { background: #3b82f622; color: #60a5fa; }
      &.p-secondary { background: var(--p-surface-700); color: var(--p-text-muted-color); }
    }

    .elapsed {
      font-size: 0.8rem;
      font-variant-numeric: tabular-nums;
      font-weight: 600;

      &.severity-success { color: #4ade80; }
      &.severity-warn    { color: #fbbf24; }
      &.severity-danger  { color: #f87171; animation: pulse 1s infinite; }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* TTL bar */
    .ttl-bar-wrap {
      height: 3px;
      background: var(--p-surface-700);
      border-radius: 2px;
      overflow: hidden;
    }

    .ttl-bar {
      height: 100%;
      border-radius: 2px;
      transition: width 1s linear;

      &.severity-success { background: #22c55e; }
      &.severity-warn    { background: #f59e0b; }
      &.severity-danger  { background: #ef4444; }
    }

    .stale-banner {
      font-size: 0.7rem;
      color: #f87171;
      font-weight: 600;
      text-align: right;
    }
  `,
})
export class AgentCardComponent {
  private readonly router = inject(Router);

  readonly task = input.required<TaskOut>();

  private readonly _tick = toSignal(interval(1000).pipe(takeUntilDestroyed()), {
    initialValue: 0,
  });

  readonly elapsedMs = computed(() => {
    this._tick();
    const at = this.task().assignedAt;
    return at ? Date.now() - new Date(at).getTime() : 0;
  });

  readonly elapsedLabel = computed(() => formatElapsed(this.elapsedMs()));

  readonly ttlPercent = computed(() =>
    Math.min(100, Math.round((this.elapsedMs() / TTL_MS) * 100))
  );

  readonly severity = computed(() => {
    const ratio = this.elapsedMs() / TTL_MS;
    if (ratio >= 0.9) return 'danger';
    if (ratio >= 0.5) return 'warn';
    return 'success';
  });

  readonly pLabel = computed(() => priorityLabel(this.task().priority));
  readonly pSeverity = computed(() => prioritySeverity(this.task().priority));

  navigate(): void {
    this.router.navigate(['/tasks', this.task().id], {
      queryParamsHandling: 'preserve',
    });
  }
}
