import {
  ChangeDetectionStrategy,
  Component,
  input,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineModule } from 'primeng/timeline';
import { TagModule } from 'primeng/tag';
import { StateHistoryEntry, HistoryResponse } from '../../models/history.model';
import { TaskState } from '../../models/task.model';

const STATE_ACCENT: Record<TaskState, string> = {
  [TaskState.BACKLOG]: '#64748b',
  [TaskState.TODO]: '#60a5fa',
  [TaskState.IN_PROGRESS]: '#a78bfa',
  [TaskState.BLOCKED]: '#f87171',
  [TaskState.IN_REVIEW]: '#fbbf24',
  [TaskState.DONE]: '#34d399',
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

interface TimelineItem {
  entry: StateHistoryEntry;
  durationMs: number | null;
  isOngoing: boolean;
}

@Component({
  selector: 'app-history-timeline',
  standalone: true,
  imports: [CommonModule, TimelineModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-timeline [value]="items()" styleClass="state-timeline">
      <ng-template pTemplate="marker" let-item>
        <span
          class="tl-dot"
          [class.ongoing]="item.isOngoing"
          [style.border-color]="dotColor(item.entry.toState)"
          [style.background]="item.isOngoing ? dotColor(item.entry.toState) : 'transparent'"
        ></span>
      </ng-template>

      <ng-template pTemplate="content" let-item>
        <div class="tl-content">
          <div class="tl-row">
            <span
              class="state-badge"
              [style.color]="dotColor(item.entry.toState)"
              [style.background]="dotColor(item.entry.toState) + '22'"
            >
              {{ item.entry.toState.replace('_', ' ') }}
            </span>
            @if (item.entry.fromState === null) {
              <span class="tl-meta">Created</span>
            }
            <span class="tl-ts">{{ fmt(item.entry.timestamp) }}</span>
          </div>

          @if (item.durationMs !== null) {
            <span class="duration-chip">{{ fmtDur(item.durationMs) }}</span>
          } @else if (item.isOngoing) {
            <span class="duration-chip ongoing-chip">ongoing <span class="pulse-dot"></span></span>
          }
        </div>
      </ng-template>
    </p-timeline>
  `,
  styles: `
    :host ::ng-deep .state-timeline .p-timeline-event-connector {
      background: var(--p-surface-600);
    }

    :host ::ng-deep .state-timeline .p-timeline-event-content {
      padding-bottom: 18px;
    }

    .tl-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid var(--p-surface-500);
      display: block;
      flex-shrink: 0;

      &.ongoing {
        box-shadow: 0 0 8px currentColor;
        animation: glow 1.5s ease-in-out infinite;
      }
    }

    @keyframes glow {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .tl-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 4px;
    }

    .tl-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .state-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .tl-meta {
      font-size: 0.72rem;
      color: var(--p-text-muted-color);
    }

    .tl-ts {
      font-size: 0.7rem;
      color: var(--p-text-muted-color);
      margin-left: auto;
    }

    .duration-chip {
      font-size: 0.68rem;
      color: var(--p-text-muted-color);
      background: var(--p-surface-700);
      padding: 1px 7px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      align-self: flex-start;
    }

    .ongoing-chip {
      color: #a78bfa;
      background: #a78bfa22;
    }

    .pulse-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #a78bfa;
      animation: pulse 1s infinite;
      display: inline-block;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `,
})
export class HistoryTimelineComponent {
  readonly history = input.required<HistoryResponse>();

  readonly items = computed<TimelineItem[]>(() => {
    const { transitions, durations } = this.history();
    return transitions.map((entry, i) => {
      const isLast = i === transitions.length - 1;
      const durKey = entry.toState;
      const durationMs = isLast
        ? durations[durKey] ?? null
        : durations[durKey] ?? null;
      return {
        entry,
        durationMs: isLast && durationMs === null ? null : durationMs,
        isOngoing: isLast && durationMs === null,
      };
    });
  });

  dotColor(state: TaskState): string {
    return STATE_ACCENT[state] ?? '#94a3b8';
  }

  fmt(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  fmtDur(ms: number): string {
    return formatDuration(ms);
  }
}
