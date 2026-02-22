import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import Hls from 'hls.js';
import { EventService } from '../../services/event.service';
import { FrameDetection } from '../../services/camera-api.service';

@Component({
  selector: 'app-live-player',
  standalone: true,
  imports: [CommonModule, ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="player-container glass-card">
      <div class="player-header">
        <i class="pi pi-desktop"></i>
        <span>Live Stream</span>
        <span class="spacer"></span>
        <button
          pButton
          [text]="true"
          [icon]="showBoxes() ? 'pi pi-eye' : 'pi pi-eye-slash'"
          (click)="showBoxes.set(!showBoxes())"
          class="toggle-boxes"
        ></button>
        @if (isPlaying()) {
        <span class="badge badge-online">● LIVE</span>
        } @else {
        <span class="badge badge-offline">● OFFLINE</span>
        }
      </div>

      <div class="video-wrapper" #videoWrapper>
        <video
          #videoPlayer
          autoplay
          muted
          playsinline
          class="video-element"
        ></video>

        <!-- Bounding box overlay -->
        @if (showBoxes() && isPlaying()) {
        <svg class="bbox-overlay" viewBox="0 0 1 1" preserveAspectRatio="none">
          @for (det of activeDetections(); track det.id) {
          <rect
            [attr.x]="det.bbox.x / det.frameWidth"
            [attr.y]="det.bbox.y / det.frameHeight"
            [attr.width]="det.bbox.width / det.frameWidth"
            [attr.height]="det.bbox.height / det.frameHeight"
            [attr.stroke]="getLabelColor(det.label)"
            fill="none"
            stroke-width="0.003"
          />
          <rect
            [attr.x]="det.bbox.x / det.frameWidth"
            [attr.y]="det.bbox.y / det.frameHeight - 0.028"
            [attr.width]="0.15"
            [attr.height]="0.028"
            [attr.fill]="getLabelColor(det.label)"
          />
          <text
            [attr.x]="det.bbox.x / det.frameWidth + 0.004"
            [attr.y]="det.bbox.y / det.frameHeight - 0.006"
            fill="white"
            font-size="0.02"
            font-family="Inter, sans-serif"
            font-weight="600"
          >
            {{ det.label }} {{ (det.confidence * 100).toFixed(0) }}%
          </text>
          }
        </svg>
        } @if (!isPlaying() && !error()) {
        <div class="overlay">
          <i class="pi pi-video overlay-icon"></i>
          <p>Connecting to stream...</p>
        </div>
        } @if (error()) {
        <div class="overlay error-overlay">
          <i class="pi pi-exclamation-circle overlay-icon"></i>
          <p>{{ error() }}</p>
          <button
            pButton
            [outlined]="true"
            icon="pi pi-refresh"
            label="Retry"
            (click)="retry()"
          ></button>
        </div>
        }
      </div>
    </div>
  `,
  styles: `
    .player-container {
      overflow: hidden;
    }

    .player-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 500;

      i {
        color: var(--accent-blue);
        font-size: 20px;
      }
    }

    .spacer {
      flex: 1;
    }

    .toggle-boxes {
      font-size: 14px !important;
      padding: 4px 8px !important;
    }

    .video-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
    }

    .video-element {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .bbox-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    }

    .overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: rgba(0, 0, 0, 0.7);
      color: var(--text-secondary);
    }

    .overlay-icon {
      font-size: 48px;
      opacity: 0.6;
    }

    .error-overlay {
      color: var(--accent-red);
    }
  `,
})
export class LivePlayerComponent implements AfterViewInit, OnDestroy {
  @Input() hlsUrl = '';
  @ViewChild('videoPlayer') videoRef!: ElementRef<HTMLVideoElement>;

  private readonly eventService = inject(EventService);

  readonly isPlaying = signal(false);
  readonly error = signal<string | null>(null);
  readonly showBoxes = signal(true);

  /** Active detections: sourced directly from the latest frame emission */
  readonly activeDetections = computed(() => {
    return this.eventService.currentFrameDetections();
  });

  private hls: Hls | null = null;
  private stallCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastPlaybackTime = 0;
  private stallCount = 0;

  /** Color map for common detection labels */
  private readonly labelColors: Record<string, string> = {
    person: '#3b82f6',
    car: '#22c55e',
    truck: '#eab308',
    bicycle: '#a855f7',
    motorcycle: '#f97316',
    bus: '#06b6d4',
    cat: '#ec4899',
    dog: '#f43f5e',
    bird: '#14b8a6',
  };

  getLabelColor(label: string): string {
    return this.labelColors[label] || '#3b82f6';
  }

  ngAfterViewInit(): void {
    this.initPlayer();
  }

  ngOnDestroy(): void {
    this.destroyPlayer();
    this.stopStallCheck();
  }

  retry(): void {
    this.error.set(null);
    this.destroyPlayer();
    this.initPlayer();
  }

  private initPlayer(): void {
    if (!this.hlsUrl) {
      this.error.set('No stream URL configured');
      return;
    }

    const video = this.videoRef.nativeElement;

    if (Hls.isSupported()) {
      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity: true,
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10000,
            maxLoadTimeMs: 120000,
            timeoutRetry: {
              maxNumRetry: 4,
              retryDelayMs: 1000,
              maxRetryDelayMs: 8000,
            },
            errorRetry: {
              maxNumRetry: 6,
              retryDelayMs: 1000,
              maxRetryDelayMs: 8000,
            },
          },
        },
      });

      this.hls.loadSource(this.hlsUrl);
      this.hls.attachMedia(video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        this.isPlaying.set(true);
        this.error.set(null);
        this.startStallCheck();
      });

      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              this.error.set('Network error — stream may be offline');
              this.hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              this.hls?.recoverMediaError();
              break;
            default:
              this.error.set('Stream error');
              this.isPlaying.set(false);
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = this.hlsUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
        this.isPlaying.set(true);
      });
    } else {
      this.error.set('HLS is not supported in this browser');
    }
  }

  private destroyPlayer(): void {
    this.stopStallCheck();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.isPlaying.set(false);
  }

  /**
   * Periodically check if the video is actually advancing.
   * If playback stalls (same currentTime for 8+ seconds), attempt recovery.
   */
  private startStallCheck(): void {
    this.stopStallCheck();
    this.stallCount = 0;
    this.lastPlaybackTime = 0;

    this.stallCheckTimer = setInterval(() => {
      if (!this.hls || !this.isPlaying()) return;

      const video = this.videoRef?.nativeElement;
      if (!video) return;

      const currentTime = video.currentTime;

      if (
        currentTime > 0 &&
        Math.abs(currentTime - this.lastPlaybackTime) < 0.1
      ) {
        this.stallCount++;
        if (this.stallCount >= 4) {
          // Stalled for ~8 seconds
          console.warn('⏱️ Stream stall detected — recovering');
          this.stallCount = 0;
          this.hls!.recoverMediaError();
        }
      } else {
        this.stallCount = 0;
      }

      this.lastPlaybackTime = currentTime;
    }, 2000);
  }

  private stopStallCheck(): void {
    if (this.stallCheckTimer) {
      clearInterval(this.stallCheckTimer);
      this.stallCheckTimer = null;
    }
  }
}
