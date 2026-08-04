import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import Hls from 'hls.js';
import { EventService } from '../../services/event.service';
import {
  CameraApiService,
  DetectionEvent,
  DvrWindow,
} from '../../services/camera-api.service';
import { labelColor } from '../../constants/labels';
import { TimelineScrubberComponent } from '../timeline-scrubber/timeline-scrubber.component';

type ViewerMode = 'live' | 'dvr';

/**
 * The camera viewer: live stream, DVR scrub-back, and the timeline that
 * drives both.
 *
 * Two sources back the same picture. Live is the low-latency HLS output
 * FFmpeg writes continuously; DVR is a playlist assembled on demand from the
 * rolling recording segments. Switching between them reloads hls.js, which is
 * why seeking within a window is only a `currentTime` change — the DVR
 * playlist already spans the whole window when it loads.
 *
 * The timeline lives inside this component rather than beside it so that
 * fullscreen, which promotes a single element, keeps the scrubber and the
 * detection overlay with the video.
 */
@Component({
  selector: 'app-camera-viewer',
  standalone: true,
  imports: [CommonModule, TimelineScrubberComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="viewer glass-card" #viewer [class.fullscreen]="isFullscreen()">
      <div class="viewer-header">
        <span class="status-pill" [class.is-live]="mode() === 'live'">
          <span class="status-dot"></span>
          {{ mode() === 'live' ? 'LIVE' : 'PLAYBACK' }}
        </span>

        <span class="title">{{ title() }}</span>

        <span class="spacer"></span>

        @if (detectionCount() > 0 && mode() === 'live') {
        <span class="detection-count">
          <i class="pi pi-bolt"></i>
          {{ detectionCount() }} in frame
        </span>
        }

        <button
          type="button"
          class="icon-btn"
          [class.off]="!showBoxes()"
          (click)="showBoxes.set(!showBoxes())"
          [title]="showBoxes() ? 'Hide detection boxes (B)' : 'Show detection boxes (B)'"
        >
          <i class="pi" [class]="showBoxes() ? 'pi-eye' : 'pi-eye-slash'"></i>
        </button>

        <button
          type="button"
          class="icon-btn"
          (click)="toggleFullscreen()"
          [title]="isFullscreen() ? 'Exit fullscreen (F)' : 'Fullscreen (F)'"
        >
          <i
            class="pi"
            [class]="
              isFullscreen() ? 'pi-window-minimize' : 'pi-window-maximize'
            "
          ></i>
        </button>
      </div>

      <div class="video-wrapper" (dblclick)="toggleFullscreen()">
        <video
          #videoPlayer
          autoplay
          muted
          playsinline
          class="video-element"
          (timeupdate)="onTimeUpdate()"
          (playing)="onPlaying()"
          (waiting)="buffering.set(true)"
          (ended)="onEnded()"
        ></video>

        @if (showBoxes() && mode() === 'live' && isPlaying()) {
        <svg class="bbox-overlay" viewBox="0 0 1 1" preserveAspectRatio="none">
          @for (det of activeDetections(); track det.id) {
          <rect
            [attr.x]="det.bbox.x / det.frameWidth"
            [attr.y]="det.bbox.y / det.frameHeight"
            [attr.width]="det.bbox.width / det.frameWidth"
            [attr.height]="det.bbox.height / det.frameHeight"
            [attr.stroke]="color(det.label)"
            fill="none"
            stroke-width="0.003"
          />
          <rect
            [attr.x]="det.bbox.x / det.frameWidth"
            [attr.y]="det.bbox.y / det.frameHeight - 0.028"
            [attr.width]="0.15"
            [attr.height]="0.028"
            [attr.fill]="color(det.label)"
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
        }

        <!-- Playback transport, DVR only: live has nothing to pause into -->
        @if (mode() === 'dvr') {
        <div class="transport">
          <button
            type="button"
            class="transport-btn"
            (click)="nudge(-10)"
            title="Back 10s (←)"
          >
            <i class="pi pi-backward"></i>
          </button>
          <button
            type="button"
            class="transport-btn primary"
            (click)="togglePlay()"
            [title]="paused() ? 'Play (space)' : 'Pause (space)'"
          >
            <i class="pi" [class]="paused() ? 'pi-play' : 'pi-pause'"></i>
          </button>
          <button
            type="button"
            class="transport-btn"
            (click)="nudge(10)"
            title="Forward 10s (→)"
          >
            <i class="pi pi-forward"></i>
          </button>
        </div>
        } @if (buffering() && !error()) {
        <div class="overlay subtle">
          <i class="pi pi-spin pi-spinner overlay-icon"></i>
        </div>
        } @else if (!isPlaying() && !error()) {
        <div class="overlay">
          <i class="pi pi-video overlay-icon"></i>
          <p>{{ mode() === 'live' ? 'Connecting to stream…' : 'Loading footage…' }}</p>
        </div>
        } @if (error(); as message) {
        <div class="overlay error-overlay">
          <i class="pi pi-exclamation-circle overlay-icon"></i>
          <p>{{ message }}</p>
          <button type="button" class="retry-btn" (click)="retry()">
            <i class="pi pi-refresh"></i> Retry
          </button>
        </div>
        }
      </div>

      <app-timeline-scrubber
        [dvrWindow]="dvrWindow()"
        [markers]="markers()"
        [position]="position()"
        [live]="mode() === 'live'"
        [rangeMinutes]="rangeMinutes()"
        (seek)="seekTo($event)"
        (goLive)="goLive()"
        (rangeChange)="setRange($event)"
      />
    </div>
  `,
  styles: `
    .viewer {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .viewer.fullscreen {
      border-radius: 0;
      border: none;
      height: 100%;
      background: var(--bg-primary);
    }

    .viewer-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-color);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      background: rgba(234, 179, 8, 0.12);
      color: var(--accent-yellow);

      &.is-live {
        background: rgba(239, 68, 68, 0.12);
        color: var(--accent-red);
      }
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .title {
      font-weight: 500;
      font-size: 14px;
    }

    .spacer {
      flex: 1;
    }

    .detection-count {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      color: var(--text-muted);

      i {
        font-size: 12px;
        color: var(--accent-blue);
      }
    }

    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;

      &:hover {
        background: var(--bg-card-hover);
        color: var(--text-primary);
      }

      &.off {
        color: var(--text-muted);
      }

      i {
        font-size: 15px;
      }
    }

    .video-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
    }

    .fullscreen .video-wrapper {
      flex: 1;
      aspect-ratio: auto;
      min-height: 0;
    }

    .video-element {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .bbox-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    }

    .transport {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 12;
    }

    .video-wrapper:hover .transport,
    .transport:focus-within {
      opacity: 1;
    }

    .transport-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: #fff;
      cursor: pointer;

      &:hover {
        background: rgba(255, 255, 255, 0.15);
      }

      &.primary {
        width: 36px;
        height: 36px;
        background: rgba(255, 255, 255, 0.15);
      }

      i {
        font-size: 14px;
      }
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
      z-index: 11;

      &.subtle {
        background: rgba(0, 0, 0, 0.25);
      }
    }

    .overlay-icon {
      font-size: 44px;
      opacity: 0.6;
    }

    .error-overlay {
      color: var(--accent-red);
    }

    .retry-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid currentColor;
      background: transparent;
      color: inherit;
      font-size: 13px;
      cursor: pointer;

      &:hover {
        background: rgba(239, 68, 68, 0.12);
      }
    }
  `,
})
export class CameraViewerComponent implements AfterViewInit, OnDestroy {
  readonly markers = input<DetectionEvent[]>([]);
  readonly title = input('Front Camera');

  /** Emits the wall-clock position whenever playback mode or target changes. */
  readonly positionChange = output<Date | null>();
  /** Emits when the timeline zoom changes, so markers can be refetched. */
  readonly rangeChange = output<number>();

  private readonly api = inject(CameraApiService);
  private readonly eventService = inject(EventService);

  private readonly videoRef =
    viewChild.required<ElementRef<HTMLVideoElement>>('videoPlayer');
  private readonly viewerRef =
    viewChild.required<ElementRef<HTMLElement>>('viewer');

  readonly mode = signal<ViewerMode>('live');
  readonly isPlaying = signal(false);
  readonly buffering = signal(false);
  readonly paused = signal(false);
  readonly error = signal<string | null>(null);
  readonly showBoxes = signal(true);
  readonly isFullscreen = signal(false);
  readonly rangeMinutes = signal(30);
  readonly dvrWindow = signal<DvrWindow | null>(null);
  /** Wall-clock position while scrubbed back; null means live. */
  readonly position = signal<Date | null>(null);

  readonly activeDetections = computed(() =>
    this.eventService.currentFrameDetections()
  );
  readonly detectionCount = computed(() => this.activeDetections().length);

  private hls: Hls | null = null;
  private stallCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastPlaybackTime = 0;
  private stallCount = 0;
  /** Media time to apply once the next manifest is ready. */
  private pendingSeekSec: number | null = null;
  /** Pause as soon as the frame at the seek target is actually showing. */
  private pauseWhenReady = false;

  readonly color = labelColor;

  ngAfterViewInit(): void {
    this.loadLive();
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.refreshDvrWindow();
  }

  ngOnDestroy(): void {
    this.destroyPlayer();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }

  // ── Transport ──

  goLive(): void {
    this.pauseWhenReady = false;
    this.position.set(null);
    this.positionChange.emit(null);
    if (this.mode() === 'live') return;
    this.mode.set('live');
    this.loadLive();
  }

  /**
   * Seek to a wall-clock instant. Staying inside the loaded DVR window is
   * just a `currentTime` change; anything else needs a fresh playlist.
   */
  seekTo(target: Date): void {
    this.position.set(target);
    this.positionChange.emit(target);

    const mediaSec = this.wallToMedia(target);
    if (this.mode() === 'dvr' && mediaSec !== null) {
      // Already inside the loaded window — seeking is just a time change.
      const video = this.videoRef().nativeElement;
      video.currentTime = mediaSec;
      if (this.pauseWhenReady) {
        // Handled here rather than in `playing`, which does not re-fire for a
        // seek that never interrupts playback.
        this.pauseWhenReady = false;
        video.pause();
        this.paused.set(true);
      } else {
        video.play().catch(() => undefined);
        this.paused.set(false);
      }
      return;
    }

    this.mode.set('dvr');
    this.loadDvr(target);
  }

  setRange(minutes: number): void {
    if (minutes === this.rangeMinutes()) return;
    this.rangeMinutes.set(minutes);
    this.rangeChange.emit(minutes);
    // A wider window is a different playlist, so DVR playback has to reload
    // around wherever the playhead currently sits.
    const target = this.position();
    this.refreshDvrWindow().then(() => {
      if (this.mode() === 'dvr' && target) this.loadDvr(target);
    });
  }

  togglePlay(): void {
    const video = this.videoRef().nativeElement;
    if (video.paused) {
      video.play().catch(() => undefined);
      this.paused.set(false);
    } else {
      video.pause();
      this.paused.set(true);
    }
  }

  nudge(seconds: number): void {
    const from = this.position() ?? new Date();
    this.seekTo(new Date(from.getTime() + seconds * 1000));
  }

  /**
   * Jump to a moment and hold on it — used when picking an event out of the
   * activity list, where the point is to look at the frame rather than to
   * resume playback from it.
   */
  seekAndPause(target: Date): void {
    this.pauseWhenReady = true;
    this.seekTo(target);
  }

  retry(): void {
    this.error.set(null);
    if (this.mode() === 'live') {
      this.loadLive();
    } else {
      this.loadDvr(this.position() ?? new Date());
    }
  }

  // ── Fullscreen ──

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      this.viewerRef()
        .nativeElement.requestFullscreen()
        .catch(() => undefined);
    }
  }

  private readonly onFullscreenChange = (): void => {
    this.isFullscreen.set(
      document.fullscreenElement === this.viewerRef().nativeElement
    );
  };

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    // Never steal keys from a filter box or the timeline's own arrow handling.
    if (
      target?.closest('input, textarea, select, [contenteditable="true"]') ||
      target?.closest('app-timeline-scrubber') ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'f':
        this.toggleFullscreen();
        break;
      case 'b':
        this.showBoxes.set(!this.showBoxes());
        break;
      case 'l':
        this.goLive();
        break;
      case ' ':
        if (this.mode() !== 'dvr') return;
        event.preventDefault();
        this.togglePlay();
        break;
      case 'arrowleft':
        event.preventDefault();
        this.nudge(event.shiftKey ? -60 : -10);
        break;
      case 'arrowright':
        event.preventDefault();
        this.nudge(event.shiftKey ? 60 : 10);
        break;
      default:
        return;
    }
  }

  // ── Playback events ──

  onPlaying(): void {
    this.isPlaying.set(true);
    this.buffering.set(false);
    this.error.set(null);

    // Pausing before playback starts leaves the element on a blank frame, so
    // a requested pause waits until there is actually a picture to hold.
    if (this.pauseWhenReady) {
      this.pauseWhenReady = false;
      this.videoRef().nativeElement.pause();
      this.paused.set(true);
      return;
    }
    this.paused.set(false);
  }

  /**
   * Track the playhead from media time — but not before a requested seek has
   * been applied, and not while the source is broken. In both cases the
   * element still reports `currentTime` 0, which would otherwise yank the
   * scrubber back to the start of the window under the user.
   */
  onTimeUpdate(): void {
    if (this.mode() !== 'dvr' || this.pendingSeekSec !== null || this.error()) {
      return;
    }
    const wall = this.mediaToWall(this.videoRef().nativeElement.currentTime);
    if (wall) this.position.set(wall);
  }

  /** Running off the end of the DVR window means we have caught up to live. */
  onEnded(): void {
    if (this.mode() === 'dvr') this.goLive();
  }

  // ── Source loading ──

  private loadLive(): void {
    this.pendingSeekSec = null;
    this.loadSource(this.api.getHlsUrl(), true);
  }

  private loadDvr(target: Date): void {
    this.refreshDvrWindow().then(() => {
      this.pendingSeekSec = this.wallToMedia(target) ?? 0;
      this.loadSource(this.api.getDvrPlaylistUrl(this.rangeMinutes()), false);
    });
  }

  private async refreshDvrWindow(): Promise<void> {
    try {
      const window = await new Promise<DvrWindow>((resolve, reject) =>
        this.api.getDvrWindow(this.rangeMinutes()).subscribe({
          next: resolve,
          error: reject,
        })
      );
      this.dvrWindow.set(window);
    } catch {
      this.dvrWindow.set(null);
    }
  }

  private loadSource(url: string, lowLatency: boolean): void {
    this.destroyPlayer();
    this.buffering.set(true);

    const video = this.videoRef().nativeElement;

    if (!Hls.isSupported()) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari) handles both playlists without hls.js.
        video.src = url;
        video.addEventListener(
          'loadedmetadata',
          () => {
            this.applyPendingSeek();
            video.play().catch(() => undefined);
            this.isPlaying.set(true);
          },
          { once: true }
        );
        return;
      }
      this.error.set('HLS is not supported in this browser');
      return;
    }

    // The live playlist is tuned for latency; the DVR playlist is a VOD
    // snapshot where holding a long buffer is what makes scrubbing smooth.
    this.hls = new Hls(
      lowLatency
        ? {
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
          }
        : { enableWorker: true, lowLatencyMode: false, maxBufferLength: 60 }
    );

    this.hls.loadSource(url);
    this.hls.attachMedia(video);

    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.applyPendingSeek();
      video.play().catch(() => {
        /* autoplay may be blocked */
      });
      this.isPlaying.set(true);
      this.error.set(null);
      if (lowLatency) this.startStallCheck();
    });

    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      // A load that never produced a picture has no frame to hold, and a
      // pause left armed here would fire on whatever the user played next.
      this.pauseWhenReady = false;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          this.error.set(
            lowLatency
              ? 'Network error — stream may be offline'
              : 'No recorded footage for this moment'
          );
          if (lowLatency) this.hls?.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          this.hls?.recoverMediaError();
          break;
        default:
          this.error.set('Stream error');
          this.isPlaying.set(false);
          break;
      }
    });
  }

  private applyPendingSeek(): void {
    if (this.pendingSeekSec === null) return;
    this.videoRef().nativeElement.currentTime = this.pendingSeekSec;
    this.pendingSeekSec = null;
  }

  private destroyPlayer(): void {
    this.stopStallCheck();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.isPlaying.set(false);
  }

  // ── Wall-clock ↔ media-time mapping ──
  //
  // Recording gaps are absent from the assembled playlist, so the two clocks
  // only line up within a single contiguous run.

  private wallToMedia(target: Date): number | null {
    const runs = this.dvrWindow()?.runs;
    if (!runs?.length) return null;

    const targetMs = target.getTime();
    for (const run of runs) {
      const startMs = new Date(run.start).getTime();
      const endMs = new Date(run.end).getTime();
      if (targetMs < startMs) {
        // Landed in a gap — resume at the next available footage.
        return run.mediaOffsetSec;
      }
      if (targetMs <= endMs) {
        return run.mediaOffsetSec + (targetMs - startMs) / 1000;
      }
    }
    return null; // past the DVR edge
  }

  private mediaToWall(mediaSec: number): Date | null {
    const runs = this.dvrWindow()?.runs;
    if (!runs?.length) return null;

    for (let i = runs.length - 1; i >= 0; i--) {
      const run = runs[i];
      if (mediaSec >= run.mediaOffsetSec) {
        const startMs = new Date(run.start).getTime();
        return new Date(startMs + (mediaSec - run.mediaOffsetSec) * 1000);
      }
    }
    return null;
  }

  // ── Live stall recovery ──

  /**
   * The HLS live edge can stop advancing while the player still reports
   * playing. Detect a frozen `currentTime` and force a recovery.
   */
  private startStallCheck(): void {
    this.stopStallCheck();
    this.stallCount = 0;
    this.lastPlaybackTime = 0;

    this.stallCheckTimer = setInterval(() => {
      if (!this.hls || !this.isPlaying() || this.mode() !== 'live') return;

      const currentTime = this.videoRef()?.nativeElement.currentTime;
      if (currentTime === undefined) return;

      if (
        currentTime > 0 &&
        Math.abs(currentTime - this.lastPlaybackTime) < 0.1
      ) {
        this.stallCount++;
        if (this.stallCount >= 4) {
          console.warn('⏱️ Stream stall detected — recovering');
          this.stallCount = 0;
          this.hls.recoverMediaError();
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
