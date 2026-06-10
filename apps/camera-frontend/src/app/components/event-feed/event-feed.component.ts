import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  inject,
  signal,
  computed,
  viewChild,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import {
  CameraApiService,
  DetectionEvent,
  RecordingStatus,
  SceneAnalysis,
  SceneEntity,
} from '../../services/camera-api.service';
import { EventService } from '../../services/event.service';
import { ClipPlayerComponent } from '../clip-player/clip-player.component';

@Component({
  selector: 'app-event-feed',
  standalone: true,
  imports: [CommonModule, DatePipe, ButtonDirective, ClipPlayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="feed-container glass-card">
      <div class="feed-header">
        <i class="pi pi-bell"></i>
        <span>Detection Feed</span>
        <span class="spacer"></span>
        <span class="event-count">{{ events().length }} events</span>
      </div>

      <div class="feed-list">
        @for (event of events(); track event.id) {
        <div class="event-item" [class.pinned]="event.pinned">
          <div class="event-icon">
            <i [class]="'pi ' + getIcon(event.label)"></i>
          </div>
          <div class="event-details">
            <div class="event-label">
              <span class="label-text">{{ event.label }}</span>
              <span class="confidence">
                {{ (event.confidence * 100).toFixed(0) }}%
              </span>
            </div>
            <div class="event-time">
              {{ event.timestamp | date : 'HH:mm:ss' }}
            </div>
            @if (getAnalysis(event.id); as analysis) {
            <div class="event-analysis">
              <div class="analysis-top">
                <i class="pi pi-sparkles analysis-icon"></i>
                @if (analysis.overallRating) {
                <span class="rating-chip" [class]="'rating-' + analysis.overallRating.toLowerCase()">
                  {{ analysis.overallRating }}
                </span>
                }
                <span class="analysis-summary">{{ analysis.description }}</span>
              </div>
              @if (analysis.entities?.length) {
              <div class="entity-chips">
                @for (entity of analysis.entities!; track $index) {
                <span class="entity-chip" [class]="'score-' + getScoreTier(entity.anomaly_score)">
                  <i class="pi" [class]="getEntityIcon(entity.type)"></i>
                  {{ entity.description }}
                </span>
                }
              </div>
              }
            </div>
            }
          </div>
          @if (event.snapshotFilename) {
          <i class="pi pi-camera snapshot-indicator"></i>
          } @if (hasRecording(event)) {
          <button
            pButton
            [text]="true"
            icon="pi pi-play-circle"
            (click)="playClip(event)"
            class="play-btn"
          ></button>
          }
          <button
            pButton
            [text]="true"
            [icon]="event.pinned ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'"
            (click)="togglePin(event)"
            class="pin-btn"
            [class.pinned]="event.pinned"
          ></button>
        </div>
        } @empty {
        <div class="empty-state">
          <i class="pi pi-ban empty-icon"></i>
          <p>No detections yet</p>
        </div>
        }
      </div>

      <app-clip-player #clipPlayer />
    </div>
  `,
  styles: `
    .feed-container {
      display: flex;
      flex-direction: column;
      max-height: 600px;
    }

    .feed-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 500;

      i {
        color: var(--accent-yellow);
        font-size: 20px;
      }
    }

    .spacer {
      flex: 1;
    }

    .event-count {
      color: var(--text-muted);
      font-size: 12px;
    }

    .feed-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .event-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      transition: background 0.15s;

      &:hover {
        background: var(--bg-card-hover);
      }
    }

    .event-icon {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.15);

      i {
        color: var(--accent-blue);
        font-size: 18px;
      }
    }

    .event-details {
      flex: 1;
      min-width: 0;
    }

    .event-label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .label-text {
      font-weight: 500;
      text-transform: capitalize;
    }

    .confidence {
      font-size: 11px;
      color: var(--accent-green);
      background: rgba(34, 197, 94, 0.1);
      padding: 1px 6px;
      border-radius: 8px;
    }

    .event-time {
      font-size: 12px;
      color: var(--text-muted);
    }

    .event-analysis {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      margin-top: 4px;
      padding: 4px 8px;
      background: rgba(168, 85, 247, 0.08);
      border-radius: var(--radius-sm);
      border-left: 2px solid #a855f7;
    }

    .analysis-icon {
      color: #a855f7;
      font-size: 12px;
      margin-top: 1px;
      flex-shrink: 0;
    }

    .analysis-top {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }

    .rating-chip {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 8px;
      flex-shrink: 0;
      letter-spacing: 0.04em;
      &.rating-low    { background: rgba(34, 197, 94, 0.15); color: var(--accent-green); }
      &.rating-medium { background: rgba(234, 179, 8, 0.15); color: var(--accent-yellow); }
      &.rating-high   { background: rgba(239, 68, 68, 0.15); color: var(--accent-red); }
    }

    .analysis-summary {
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .entity-chips {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-top: 5px;
    }

    .entity-chip {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--text-secondary);
      padding: 2px 6px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.04);
      border-left: 2px solid var(--border-color);
      &.score-medium { border-left-color: rgba(234, 179, 8, 0.5); }
      &.score-high   { border-left-color: rgba(239, 68, 68, 0.5); }
      i { font-size: 10px; color: #a855f7; flex-shrink: 0; }
    }

    .snapshot-indicator {
      color: var(--text-muted);
      font-size: 16px;
    }

    .pin-btn {
      flex-shrink: 0;
      font-size: 14px !important;
      padding: 4px !important;
      opacity: 0;
      transition: opacity 0.15s;
      color: var(--text-muted) !important;

      &.pinned {
        opacity: 1;
        color: var(--accent-yellow) !important;
      }
    }

    .play-btn {
      flex-shrink: 0;
      font-size: 16px !important;
      padding: 4px !important;
      opacity: 0;
      transition: opacity 0.15s;
      color: var(--accent-blue) !important;
    }

    .event-item:hover .pin-btn,
    .event-item:hover .play-btn {
      opacity: 1;
    }

    .event-item.pinned {
      background: rgba(234, 179, 8, 0.06);
      border-left: 2px solid var(--accent-yellow);
      padding-left: 10px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 48px 16px;
      color: var(--text-muted);
    }

    .empty-icon {
      font-size: 40px;
      opacity: 0.5;
    }
  `,
})
export class EventFeedComponent implements OnInit {
  private readonly api = inject(CameraApiService);
  private readonly eventService = inject(EventService);

  private readonly clipPlayer =
    viewChild.required<ClipPlayerComponent>('clipPlayer');

  @Input() events = signal<DetectionEvent[]>([]);

  readonly recordingStatus = signal<RecordingStatus | null>(null);

  ngOnInit(): void {
    this.api.getRecordingStatus().subscribe({
      next: (status) => this.recordingStatus.set(status),
      error: () => this.recordingStatus.set(null),
    });
  }

  /** True when the recording window still covers this event's timestamp. */
  hasRecording(event: DetectionEvent): boolean {
    const status = this.recordingStatus();
    if (!status?.enabled || !status.oldestTimestamp) return false;
    return (
      new Date(event.timestamp).getTime() >=
      new Date(status.oldestTimestamp).getTime()
    );
  }

  playClip(event: DetectionEvent): void {
    this.clipPlayer().open(event);
  }

  getAnalysis(detectionEventId: string): SceneAnalysis | undefined {
    return this.eventService.analysisMap().get(detectionEventId);
  }

  togglePin(event: DetectionEvent): void {
    this.api.togglePinEvent(event.id).subscribe({
      next: (updated) => {
        // Update the event in the recentEvents signal
        this.eventService.recentEvents.update((events) =>
          events.map((e) => (e.id === updated.id ? updated : e))
        );
      },
    });
  }

  getScoreTier(score: number): 'low' | 'medium' | 'high' {
    if (score <= 3) return 'low';
    if (score <= 6) return 'medium';
    return 'high';
  }

  getEntityIcon(type: SceneEntity['type']): string {
    const map: Record<string, string> = {
      person: 'pi-user',
      vehicle: 'pi-car',
      animal: 'pi-heart',
      object: 'pi-box',
    };
    return map[type] ?? 'pi-eye';
  }

  getIcon(label: string): string {
    const iconMap: Record<string, string> = {
      person: 'pi-user',
      car: 'pi-car',
      truck: 'pi-truck',
      bicycle: 'pi-wrench',
      motorcycle: 'pi-wrench',
      bus: 'pi-truck',
      cat: 'pi-heart',
      dog: 'pi-heart',
      bird: 'pi-sun',
    };
    return iconMap[label] || 'pi-eye';
  }
}
