import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { CameraViewerComponent } from '../../components/camera-viewer/camera-viewer.component';
import {
  EventCardComponent,
  EventCardVariant,
} from '../../components/event-card/event-card.component';
import { ClipPlayerComponent } from '../../components/clip-player/clip-player.component';
import {
  CameraApiService,
  CameraInfo,
  DetectionEvent,
  DetectionStats,
  RecordingStatus,
} from '../../services/camera-api.service';
import { EventService } from '../../services/event.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CameraViewerComponent,
    EventCardComponent,
    ClipPlayerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dashboard">
      <div class="stage">
        <app-camera-viewer
          [markers]="markers()"
          [title]="cameraTitle()"
          (rangeChange)="onRangeChange($event)"
        />

        <div class="status-strip glass-card">
          <span class="stat">
            <span
              class="stat-dot"
              [class.ok]="cameraInfo()?.status === 'online'"
            ></span>
            Camera
            <strong>{{ cameraInfo()?.status ?? 'unknown' }}</strong>
          </span>
          <span class="stat">
            <span class="stat-dot" [class.ok]="events.connected()"></span>
            Realtime
            <strong>{{ events.connected() ? 'connected' : 'offline' }}</strong>
          </span>
          <span class="stat">
            <i class="pi pi-wave-pulse"></i>
            Today
            <strong>{{ stats()?.todayEvents ?? '—' }}</strong>
          </span>
          <span class="stat">
            <i class="pi pi-chart-bar"></i>
            Total
            <strong>{{ stats()?.totalEvents ?? '—' }}</strong>
          </span>
          @if (recording(); as rec) {
          <span class="stat">
            <i class="pi pi-database"></i>
            Footage
            <strong>{{ coverageLabel() }}</strong>
          </span>
          }
          <span class="spacer"></span>
          @if (cameraInfo(); as info) {
          <span class="stat muted" [title]="info.rtspUrl">
            <i class="pi pi-server"></i>
            {{ info.model }} &middot; {{ info.ip }}
          </span>
          }
        </div>
      </div>

      <aside class="rail glass-card">
        <div class="rail-header">
          <i class="pi pi-bolt"></i>
          <span>Activity</span>
          <span class="spacer"></span>
          <div class="variant-rail" role="group" aria-label="Card layout">
            @for (option of variants; track option.value) {
            <button
              type="button"
              class="variant-btn"
              [class.active]="variant() === option.value"
              [title]="option.hint"
              (click)="variant.set(option.value)"
            >
              <i class="pi" [class]="option.icon"></i>
            </button>
            }
          </div>
        </div>

        <div class="rail-list" [class.gallery]="variant() === 'gallery'">
          @for (event of events.recentEvents(); track event.id) {
          <app-event-card
            [event]="event"
            [variant]="variant()"
            [playable]="playable(event)"
            (playClip)="playClip($event)"
            (togglePin)="togglePin($event)"
          />
          } @empty {
          <div class="empty">
            <i class="pi pi-moon"></i>
            <p>Nothing detected yet</p>
            <span>Events appear here the moment they happen.</span>
          </div>
          }
        </div>

        <a class="rail-footer" routerLink="/events">
          Browse all events
          <i class="pi pi-arrow-right"></i>
        </a>
      </aside>

      <app-clip-player #clipPlayer />
    </div>
  `,
  styles: `
    .dashboard {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      gap: 20px;
      align-items: start;
      max-width: 1800px;
      margin: 0 auto;
      /* Fill the viewport so the rail scrolls on its own, not the page */
      height: calc(100vh - 48px - 57px);
    }

    .stage {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .status-strip {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 18px;
      padding: 10px 16px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .stat {
      display: inline-flex;
      align-items: center;
      gap: 6px;

      strong {
        color: var(--text-primary);
        font-weight: 600;
        text-transform: capitalize;
      }

      i {
        font-size: 13px;
        color: var(--text-muted);
      }

      &.muted {
        color: var(--text-muted);
        font-family: monospace;
        font-size: 11px;
      }
    }

    .stat-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-red);

      &.ok {
        background: var(--accent-green);
      }
    }

    .spacer {
      flex: 1;
    }

    .rail {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .rail-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 500;

      > i {
        color: var(--accent-blue);
        font-size: 16px;
      }
    }

    .variant-rail {
      display: flex;
      gap: 2px;
      padding: 2px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.04);
    }

    .variant-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 22px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;

      &:hover {
        color: var(--text-primary);
      }

      &.active {
        background: rgba(59, 130, 246, 0.18);
        color: var(--accent-blue);
      }

      i {
        font-size: 12px;
      }
    }

    .rail-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;

      &.gallery {
        display: grid;
        grid-template-columns: 1fr;
      }
    }

    .rail-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px;
      border-top: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-secondary);
      text-decoration: none;

      &:hover {
        color: var(--accent-blue);
        text-decoration: none;
      }

      i {
        font-size: 11px;
      }
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 56px 20px;
      text-align: center;
      color: var(--text-muted);

      i {
        font-size: 32px;
        opacity: 0.35;
      }

      p {
        color: var(--text-secondary);
      }

      span {
        font-size: 12px;
      }
    }

    @media (max-width: 1180px) {
      .dashboard {
        grid-template-columns: 1fr;
        height: auto;
      }

      .rail {
        height: 520px;
      }
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(CameraApiService);
  readonly events = inject(EventService);

  private readonly clipPlayer =
    viewChild.required<ClipPlayerComponent>('clipPlayer');

  readonly cameraInfo = signal<CameraInfo | null>(null);
  readonly stats = signal<DetectionStats | null>(null);
  readonly recording = signal<RecordingStatus | null>(null);
  readonly variant = signal<EventCardVariant>('detail');

  /**
   * Detections plotted on the timeline. The live buffer only reaches back as
   * far as this session, so the window is backfilled over HTTP and live
   * events are merged on top.
   */
  private readonly windowEvents = signal<DetectionEvent[]>([]);

  readonly markers = computed(() => {
    const byId = new Map(this.windowEvents().map((e) => [e.id, e]));
    for (const event of this.events.recentEvents()) byId.set(event.id, event);
    return [...byId.values()];
  });

  readonly cameraTitle = computed(() => this.cameraInfo()?.model ?? 'Camera');

  readonly coverageLabel = computed(() => {
    const rec = this.recording();
    if (!rec?.oldestTimestamp || !rec.newestTimestamp) return '—';
    const hours =
      (new Date(rec.newestTimestamp).getTime() -
        new Date(rec.oldestTimestamp).getTime()) /
      3_600_000;
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 48) return `${hours.toFixed(1)}h`;
    return `${Math.round(hours / 24)}d`;
  });

  readonly variants: {
    value: EventCardVariant;
    icon: string;
    hint: string;
  }[] = [
    { value: 'compact', icon: 'pi-bars', hint: 'Compact rows' },
    { value: 'detail', icon: 'pi-list', hint: 'Detail cards with AI summary' },
    { value: 'gallery', icon: 'pi-th-large', hint: 'Snapshot-first cards' },
  ];

  ngOnInit(): void {
    this.api.getCameraInfo().subscribe({
      next: (info) => this.cameraInfo.set(info),
      error: () => console.warn('Failed to fetch camera info'),
    });

    this.api.getDetectionStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => console.warn('Failed to fetch stats'),
    });

    this.api.getRecordingStatus().subscribe({
      next: (status) => this.recording.set(status),
      error: () => this.recording.set(null),
    });

    this.loadWindow(30);
  }

  onRangeChange(minutes: number): void {
    this.loadWindow(minutes);
  }

  /** True when recorded video still covers this event's timestamp. */
  playable(event: DetectionEvent): boolean {
    const status = this.recording();
    if (!status?.enabled || !status.oldestTimestamp) return false;
    return (
      new Date(event.timestamp).getTime() >=
      new Date(status.oldestTimestamp).getTime()
    );
  }

  playClip(event: DetectionEvent): void {
    this.clipPlayer().open(event);
  }

  togglePin(event: DetectionEvent): void {
    this.api.togglePinEvent(event.id).subscribe({
      next: (updated) => this.events.patch(updated),
    });
  }

  private loadWindow(minutes: number): void {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    this.api
      .getDetections({ since, limit: 500, includeAnalysis: true })
      .subscribe({
        next: (res) => {
          this.windowEvents.set(res.events);
          // Prime the rail too, so a fresh page load is not empty.
          this.events.seed(res.events.slice(0, 40));
        },
        error: () => this.windowEvents.set([]),
      });
  }
}
