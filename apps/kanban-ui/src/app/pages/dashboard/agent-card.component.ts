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
import { ActivityEntryOut } from '../../models/activity.model';

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
      <!-- Top row: spinner + agent name + elapsed + priority -->
      <div class="agent-top">
        <div class="agent-identity">
          @if (severity() === 'danger') {
          <span class="status-icon stale">⚠️</span>
          } @else {
          <span class="status-icon working">
            <span class="spinner-ring"></span>
          </span>
          }
          <span class="agent-name">{{ task().assignee }}</span>
        </div>
        <div class="agent-meta">
          <span class="priority-badge" [class]="'p-' + pSeverity()">
            {{ pLabel() }}
          </span>
          <span class="elapsed" [class]="'severity-' + severity()">
            {{ elapsedLabel() }}
          </span>
        </div>
      </div>

      <!-- Task title -->
      <div class="task-title" [title]="task().title">
        {{ task().title }}
      </div>

      <!-- Status update (latest comment) -->
      @if (latestComment()) {
      <div class="status-update">
        <span class="status-dot"></span>
        <span class="status-text">{{ commentPreview() }}</span>
        <span class="status-age">{{ commentAge() }}</span>
      </div>
      } @else {
      <div class="status-update placeholder">
        <span class="status-dot"></span>
        <span class="status-text">Working…</span>
      </div>
      }

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
      gap: 6px;

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

    /* Top row */
    .agent-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .agent-identity {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .status-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;

      &.stale {
        font-size: 1rem;
        line-height: 1;
      }
    }

    /* Animated spinner ring */
    .spinner-ring {
      display: block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--p-surface-600);
      border-top-color: var(--p-primary-color);
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .agent-name {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--p-primary-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .agent-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
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
      font-size: 0.78rem;
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

    /* Task title */
    .task-title {
      font-size: 0.8rem;
      color: var(--p-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-left: 28px; /* align with agent name (icon width + gap) */
    }

    /* Status update row */
    .status-update {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding-left: 28px;
      min-height: 18px;

      &.placeholder .status-text {
        color: var(--p-surface-500);
        font-style: italic;
      }
    }

    .status-dot {
      flex-shrink: 0;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--p-primary-color);
      opacity: 0.6;
      margin-top: 4px;
      align-self: flex-start;
    }

    .status-text {
      flex: 1;
      font-size: 0.72rem;
      color: var(--p-text-muted-color);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .status-age {
      flex-shrink: 0;
      font-size: 0.65rem;
      color: var(--p-surface-500);
      white-space: nowrap;
    }

    /* TTL bar */
    .ttl-bar-wrap {
      height: 3px;
      background: var(--p-surface-700);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 2px;
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
  readonly latestComment = input<ActivityEntryOut | null>(null);

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

  /** Truncated preview of the latest comment content */
  readonly commentPreview = computed(() => {
    const c = this.latestComment();
    if (!c) return '';
    // Strip leading "Status:" or similar prefix agents sometimes add
    return c.content.length > 200 ? c.content.slice(0, 200) + '…' : c.content;
  });

  /** Relative age of the latest comment */
  readonly commentAge = computed(() => {
    this._tick();
    const c = this.latestComment();
    if (!c) return '';
    const ms = Date.now() - new Date(c.createdAt).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  });

  navigate(): void {
    this.router.navigate(['/tasks', this.task().id], {
      queryParamsHandling: 'preserve',
    });
  }
}
