import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Dialog } from 'primeng/dialog';
import {
  CameraApiService,
  DetectionEvent,
} from '../../services/camera-api.service';

/**
 * Modal video player for recorded clips around a detection event.
 * Open it from anywhere via a template reference:
 *   <app-clip-player #clipPlayer />
 *   ... (click)="clipPlayer.open(event)"
 */
@Component({
  selector: 'app-clip-player',
  standalone: true,
  imports: [CommonModule, DatePipe, Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [dismissableMask]="true"
      [draggable]="false"
      [style]="{ width: 'min(900px, 95vw)' }"
      [header]="title()"
    >
      @if (visible() && clipUrl(); as url) { @if (!error()) {
      <video
        class="clip-video"
        [src]="url"
        controls
        autoplay
        preload="auto"
        (error)="onVideoError()"
      ></video>
      } @else {
      <div class="clip-error">
        <i class="pi pi-video"></i>
        <p>No recorded video is available for this event.</p>
        <span class="clip-error-hint">
          Recordings may not cover this time range yet, or it has aged out of
          the video retention window.
        </span>
      </div>
      } @if (event(); as ev) {
      <div class="clip-meta">
        <span class="clip-label">{{ ev.label }}</span>
        <span>{{ ev.timestamp | date : 'MMM d, y, HH:mm:ss' }}</span>
        <span class="clip-window">
          {{ prerollSec }}s before → {{ postrollSec }}s after
        </span>
      </div>
      } }
    </p-dialog>
  `,
  styles: `
    .clip-video {
      display: block;
      width: 100%;
      max-height: 70vh;
      border-radius: var(--radius-sm);
      background: #000;
    }

    .clip-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 16px;
      color: var(--text-muted);
      text-align: center;

      i {
        font-size: 40px;
        opacity: 0.4;
      }

      p {
        margin: 0;
        color: var(--text-secondary);
      }
    }

    .clip-error-hint {
      font-size: 12px;
    }

    .clip-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .clip-label {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent-blue);
      padding: 2px 10px;
      border-radius: 12px;
      font-weight: 500;
      text-transform: capitalize;
    }

    .clip-window {
      margin-left: auto;
    }
  `,
})
export class ClipPlayerComponent {
  private readonly api = inject(CameraApiService);

  /** Seconds of recorded video included before/after the event */
  readonly prerollSec = 10;
  readonly postrollSec = 20;

  readonly visible = signal(false);
  readonly error = signal(false);
  readonly event = signal<DetectionEvent | null>(null);
  readonly clipUrl = signal<string | null>(null);

  readonly title = computed(() => {
    const ev = this.event();
    return ev ? `Playback — ${ev.label}` : 'Playback';
  });

  open(event: DetectionEvent): void {
    const start = new Date(
      new Date(event.timestamp).getTime() - this.prerollSec * 1000
    );
    this.event.set(event);
    this.error.set(false);
    this.clipUrl.set(
      this.api.getClipUrl(start, this.prerollSec + this.postrollSec)
    );
    this.visible.set(true);
  }

  onVisibleChange(visible: boolean): void {
    this.visible.set(visible);
    if (!visible) {
      // Drop the src so the <video> stops downloading/playing
      this.clipUrl.set(null);
    }
  }

  onVideoError(): void {
    this.error.set(true);
  }
}
