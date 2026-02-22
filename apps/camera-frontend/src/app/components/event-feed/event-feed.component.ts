import {
  ChangeDetectionStrategy,
  Component,
  Input,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { DetectionEvent } from '../../services/camera-api.service';

@Component({
  selector: 'app-event-feed',
  standalone: true,
  imports: [CommonModule, DatePipe, MatIconModule, MatListModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="feed-container glass-card">
      <div class="feed-header">
        <mat-icon>notifications_active</mat-icon>
        <span>Detection Feed</span>
        <span class="spacer"></span>
        <span class="event-count">{{ events().length }} events</span>
      </div>

      <div class="feed-list">
        @for (event of events(); track event.id) {
        <div class="event-item">
          <div class="event-icon">
            <mat-icon>{{ getIcon(event.label) }}</mat-icon>
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
          </div>
          @if (event.snapshotFilename) {
          <mat-icon class="snapshot-indicator">photo_camera</mat-icon>
          }
        </div>
        } @empty {
        <div class="empty-state">
          <mat-icon>sensors_off</mat-icon>
          <p>No detections yet</p>
        </div>
        }
      </div>
    </div>
  `,
  styles: `
    .feed-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .feed-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 500;

      mat-icon {
        color: var(--accent-yellow);
        font-size: 20px;
        width: 20px;
        height: 20px;
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

      mat-icon {
        color: var(--accent-blue);
        font-size: 18px;
        width: 18px;
        height: 18px;
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

    .snapshot-indicator {
      color: var(--text-muted);
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 48px 16px;
      color: var(--text-muted);

      mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        opacity: 0.5;
      }
    }
  `,
})
export class EventFeedComponent {
  @Input() events = signal<DetectionEvent[]>([]);

  getIcon(label: string): string {
    const iconMap: Record<string, string> = {
      person: 'person',
      car: 'directions_car',
      truck: 'local_shipping',
      bicycle: 'pedal_bike',
      motorcycle: 'two_wheeler',
      bus: 'directions_bus',
      cat: 'pets',
      dog: 'pets',
      bird: 'flutter_dash',
    };
    return iconMap[label] || 'visibility';
  }
}
