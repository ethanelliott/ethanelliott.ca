import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { LivePlayerComponent } from '../../components/live-player/live-player.component';
import { EventFeedComponent } from '../../components/event-feed/event-feed.component';
import {
  CameraApiService,
  CameraInfo,
  DetectionStats,
} from '../../services/camera-api.service';
import { EventService } from '../../services/event.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    LivePlayerComponent,
    EventFeedComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dashboard">
      <!-- Stats Bar -->
      <div class="stats-row">
        <div class="stat-card glass-card">
          <mat-icon class="stat-icon camera-icon">videocam</mat-icon>
          <div class="stat-content">
            <span class="stat-label">Camera</span>
            <span class="stat-value">
              @if (cameraInfo()) {
              <span [class]="'badge badge-' + cameraInfo()!.status">
                {{ cameraInfo()!.status }}
              </span>
              } @else {
              <span class="badge badge-offline">unknown</span>
              }
            </span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <mat-icon class="stat-icon ws-icon">sync_alt</mat-icon>
          <div class="stat-content">
            <span class="stat-label">WebSocket</span>
            <span class="stat-value">
              @if (eventService.connected()) {
              <span class="badge badge-online">connected</span>
              } @else {
              <span class="badge badge-offline">disconnected</span>
              }
            </span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <mat-icon class="stat-icon detect-icon">sensors</mat-icon>
          <div class="stat-content">
            <span class="stat-label">Today&rsquo;s Detections</span>
            <span class="stat-value">
              {{ stats()?.todayEvents ?? '—' }}
            </span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <mat-icon class="stat-icon total-icon">analytics</mat-icon>
          <div class="stat-content">
            <span class="stat-label">Total Events</span>
            <span class="stat-value">
              {{ stats()?.totalEvents ?? '—' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="main-grid">
        <div class="stream-column">
          <app-live-player [hlsUrl]="hlsUrl" />

          <!-- Camera Info -->
          @if (cameraInfo()) {
          <div class="camera-info glass-card">
            <div class="info-row">
              <span class="info-label">Model</span>
              <span>{{ cameraInfo()!.model }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">IP</span>
              <span>{{ cameraInfo()!.ip }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">RTSP</span>
              <span class="rtsp-url">{{ cameraInfo()!.rtspUrl }}</span>
            </div>
          </div>
          }
        </div>

        <div class="feed-column">
          <app-event-feed [events]="eventService.recentEvents" />
        </div>
      </div>
    </div>
  `,
  styles: `
    .dashboard {
      max-width: 1400px;
      margin: 0 auto;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
    }

    .stat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .camera-icon { color: var(--accent-blue); }
    .ws-icon { color: var(--accent-green); }
    .detect-icon { color: var(--accent-yellow); }
    .total-icon { color: #a855f7; }

    .stat-content {
      display: flex;
      flex-direction: column;
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-muted);
    }

    .stat-value {
      font-size: 18px;
      font-weight: 600;
    }

    .main-grid {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 24px;
      min-height: 500px;
    }

    .stream-column {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .feed-column {
      display: flex;
      flex-direction: column;
      min-height: 500px;
    }

    .camera-info {
      padding: 16px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-color);

      &:last-child {
        border-bottom: none;
      }
    }

    .info-label {
      color: var(--text-muted);
      font-size: 13px;
    }

    .rtsp-url {
      font-family: monospace;
      font-size: 12px;
      color: var(--text-secondary);
    }

    @media (max-width: 900px) {
      .main-grid {
        grid-template-columns: 1fr;
      }

      .feed-column {
        min-height: 300px;
      }
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(CameraApiService);
  readonly eventService = inject(EventService);

  readonly cameraInfo = signal<CameraInfo | null>(null);
  readonly stats = signal<DetectionStats | null>(null);
  readonly hlsUrl: string;

  constructor() {
    this.hlsUrl = this.api.getHlsUrl();
  }

  ngOnInit(): void {
    this.api.getCameraInfo().subscribe({
      next: (info) => this.cameraInfo.set(info),
      error: () => console.warn('Failed to fetch camera info'),
    });

    this.api.getDetectionStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => console.warn('Failed to fetch stats'),
    });
  }
}
