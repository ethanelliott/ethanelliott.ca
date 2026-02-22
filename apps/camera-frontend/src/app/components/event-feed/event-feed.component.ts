import {
  ChangeDetectionStrategy,
  Component,
  Input,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import {
  CameraApiService,
  DetectionEvent,
} from '../../services/camera-api.service';
import { EventService } from '../../services/event.service';

@Component({
  selector: 'app-event-feed',
  standalone: true,
  imports: [CommonModule, DatePipe, ButtonDirective],
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
          </div>
          @if (event.snapshotFilename) {
          <i class="pi pi-camera snapshot-indicator"></i>
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

    .event-item:hover .pin-btn {
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
export class EventFeedComponent {
  private readonly api = inject(CameraApiService);
  private readonly eventService = inject(EventService);

  @Input() events = signal<DetectionEvent[]>([]);

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
