import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import Hls from 'hls.js';

@Component({
  selector: 'app-live-player',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="player-container glass-card">
      <div class="player-header">
        <mat-icon>live_tv</mat-icon>
        <span>Live Stream</span>
        <span class="spacer"></span>
        @if (isPlaying()) {
        <span class="badge badge-online">● LIVE</span>
        } @else {
        <span class="badge badge-offline">● OFFLINE</span>
        }
      </div>

      <div class="video-wrapper">
        <video
          #videoPlayer
          autoplay
          muted
          playsinline
          class="video-element"
        ></video>

        @if (!isPlaying() && !error()) {
        <div class="overlay">
          <mat-icon class="overlay-icon">videocam_off</mat-icon>
          <p>Connecting to stream...</p>
        </div>
        } @if (error()) {
        <div class="overlay error-overlay">
          <mat-icon class="overlay-icon">error_outline</mat-icon>
          <p>{{ error() }}</p>
          <button mat-stroked-button (click)="retry()">
            <mat-icon>refresh</mat-icon>
            Retry
          </button>
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

      mat-icon {
        color: var(--accent-blue);
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .spacer {
      flex: 1;
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
      width: 48px;
      height: 48px;
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

  readonly isPlaying = signal(false);
  readonly error = signal<string | null>(null);

  private hls: Hls | null = null;

  ngAfterViewInit(): void {
    this.initPlayer();
  }

  ngOnDestroy(): void {
    this.destroyPlayer();
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
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.isPlaying.set(false);
  }
}
