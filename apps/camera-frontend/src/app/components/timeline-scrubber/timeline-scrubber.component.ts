import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DetectionEvent, DvrWindow } from '../../services/camera-api.service';
import { labelColor } from '../../constants/labels';

/** Zoom presets, in minutes. */
export const TIMELINE_RANGES = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
] as const;

interface Tick {
  pct: number;
  label: string;
}

interface MarkerPin {
  id: string;
  pct: number;
  color: string;
  label: string;
  time: string;
  rating: string | null;
}

interface CoverageBand {
  leftPct: number;
  widthPct: number;
}

/**
 * DVR timeline: scrub back through the rolling recording, with detection
 * events plotted where they happened.
 *
 * The track spans `rangeMinutes` back from now, with the live edge pinned to
 * the right. Wall-clock time is the only coordinate the scrubber deals in —
 * translating that into media time is the player's job, since only it knows
 * how the DVR playlist was assembled.
 */
@Component({
  selector: 'app-timeline-scrubber',
  standalone: true,
  imports: [CommonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrubber">
      <div class="controls">
        <button
          type="button"
          class="live-btn"
          [class.is-live]="live()"
          (click)="goLive.emit()"
          [attr.aria-pressed]="live()"
        >
          <span class="live-dot"></span>
          {{ live() ? 'LIVE' : 'GO LIVE' }}
        </button>

        <span class="playhead-clock" [class.muted]="live()">
          @if (live()) { Live &middot; {{ now() | date : 'HH:mm:ss' }} } @else {
          {{ displayTime() | date : 'HH:mm:ss' }}
          <span class="behind">&minus;{{ behindLabel() }}</span>
          }
        </span>

        <span class="spacer"></span>

        <div class="range-rail" role="group" aria-label="Timeline range">
          @for (range of ranges; track range.minutes) {
          <button
            type="button"
            class="range-btn"
            [class.active]="rangeMinutes() === range.minutes"
            [disabled]="range.minutes > maxRangeMinutes()"
            [title]="
              range.minutes > maxRangeMinutes()
                ? 'Not enough recorded footage'
                : 'Show the last ' + range.label
            "
            (click)="rangeChange.emit(range.minutes)"
          >
            {{ range.label }}
          </button>
          }
        </div>
      </div>

      <div
        #track
        class="track"
        role="slider"
        tabindex="0"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="100"
        [attr.aria-valuenow]="playheadPct().toFixed(0)"
        aria-label="Scrub through recorded footage"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerCancel()"
        (pointerleave)="hoverPct.set(null)"
        (keydown)="onKeydown($event)"
      >
        <!-- Recorded coverage; anything unpainted is a gap in the footage -->
        <div class="coverage">
          @for (band of coverage(); track $index) {
          <div
            class="coverage-band"
            [style.left.%]="band.leftPct"
            [style.width.%]="band.widthPct"
          ></div>
          }
        </div>

        <!-- The live edge trails the DVR edge by about one segment -->
        <div class="live-zone" [style.width.%]="liveZonePct()"></div>

        @for (tick of ticks(); track tick.pct) {
        <div class="tick" [style.left.%]="tick.pct">
          <span class="tick-label">{{ tick.label }}</span>
        </div>
        }

        @for (marker of markerPins(); track marker.id) {
        <div
          class="marker"
          [class.marker-high]="marker.rating === 'HIGH'"
          [style.left.%]="marker.pct"
          [style.background]="marker.color"
          [title]="marker.label + ' · ' + marker.time"
        ></div>
        }

        @if (hoverPct(); as pct) {
        <div class="hover-line" [style.left.%]="pct"></div>
        <div
          class="hover-bubble"
          [style.left.%]="pct"
          [class.clamp-start]="pct < 8"
          [class.clamp-end]="pct > 92"
        >
          {{ hoverTime() | date : 'HH:mm:ss' }}
        </div>
        }

        <div class="playhead" [style.left.%]="playheadPct()">
          <div class="playhead-grip"></div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .scrubber {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 14px 14px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .spacer {
      flex: 1;
    }

    .live-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--border-color);
      background: transparent;
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;

      &:hover {
        color: var(--text-primary);
        border-color: var(--text-muted);
      }

      &.is-live {
        color: var(--accent-red);
        border-color: rgba(239, 68, 68, 0.4);
        background: rgba(239, 68, 68, 0.1);
        cursor: default;
      }
    }

    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .is-live .live-dot {
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .is-live .live-dot {
        animation: none;
      }
    }

    .playhead-clock {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);

      &.muted {
        color: var(--text-muted);
      }
    }

    .behind {
      color: var(--accent-yellow);
      font-weight: 600;
    }

    .range-rail {
      display: flex;
      gap: 2px;
      padding: 2px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.04);
    }

    .range-btn {
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: color 0.15s, background 0.15s;

      &:hover:not(:disabled) {
        color: var(--text-primary);
      }

      &.active {
        background: rgba(59, 130, 246, 0.18);
        color: var(--accent-blue);
      }

      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
    }

    .track {
      position: relative;
      height: 46px;
      border-radius: var(--radius-sm);
      background: #0d0d15;
      border: 1px solid var(--border-color);
      cursor: pointer;
      touch-action: none;
      overflow: hidden;

      &:focus-visible {
        outline: 2px solid var(--accent-blue);
        outline-offset: 2px;
      }
    }

    .coverage {
      position: absolute;
      inset: 0;
    }

    .coverage-band {
      position: absolute;
      top: 0;
      bottom: 0;
      background: linear-gradient(
        180deg,
        rgba(59, 130, 246, 0.12),
        rgba(59, 130, 246, 0.05)
      );
    }

    .live-zone {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      background: repeating-linear-gradient(
        45deg,
        rgba(255, 255, 255, 0.05) 0 4px,
        transparent 4px 8px
      );
    }

    .tick {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: rgba(255, 255, 255, 0.07);
      pointer-events: none;
    }

    .tick-label {
      position: absolute;
      bottom: 2px;
      left: 4px;
      font-size: 9px;
      font-variant-numeric: tabular-nums;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .marker {
      position: absolute;
      top: 6px;
      width: 3px;
      height: 22px;
      margin-left: -1px;
      border-radius: 2px;
      opacity: 0.85;
      pointer-events: none;
    }

    .marker-high {
      top: 3px;
      height: 28px;
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.8);
    }

    .hover-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: rgba(255, 255, 255, 0.4);
      pointer-events: none;
    }

    .hover-bubble {
      position: absolute;
      top: 2px;
      transform: translateX(-50%);
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.85);
      color: var(--text-primary);
      font-size: 10px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      pointer-events: none;

      &.clamp-start {
        transform: translateX(0);
      }

      &.clamp-end {
        transform: translateX(-100%);
      }
    }

    .playhead {
      position: absolute;
      top: -2px;
      bottom: -2px;
      width: 2px;
      margin-left: -1px;
      background: var(--text-primary);
      pointer-events: none;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
    }

    .playhead-grip {
      position: absolute;
      top: 0;
      left: 50%;
      width: 10px;
      height: 10px;
      transform: translate(-50%, -3px) rotate(45deg);
      background: var(--text-primary);
      border-radius: 2px;
    }
  `,
})
export class TimelineScrubberComponent implements OnDestroy {
  readonly dvrWindow = input<DvrWindow | null>(null);
  readonly markers = input<DetectionEvent[]>([]);
  /** Wall-clock position of the playhead; ignored while live. */
  readonly position = input<Date | null>(null);
  readonly live = input(false);
  readonly rangeMinutes = input(30);
  /** How far the DVR edge trails live, in seconds. */
  readonly liveLagSec = input(12);

  readonly seek = output<Date>();
  readonly goLive = output<void>();
  readonly rangeChange = output<number>();

  readonly ranges = TIMELINE_RANGES;

  private readonly trackRef = viewChild.required<ElementRef<HTMLElement>>(
    'track'
  );

  /** Ticks once a second so the window slides and the clock stays honest. */
  readonly now = signal(new Date());
  readonly hoverPct = signal<number | null>(null);
  private readonly dragPct = signal<number | null>(null);
  private dragging = false;

  private readonly clockTimer = setInterval(
    () => this.now.set(new Date()),
    1000
  );

  private readonly spanMs = computed(() => this.rangeMinutes() * 60_000);
  private readonly endMs = computed(() => this.now().getTime());
  private readonly startMs = computed(() => this.endMs() - this.spanMs());

  /** Widest preset the recorded footage can actually fill. */
  readonly maxRangeMinutes = computed(() => {
    const available = this.dvrWindow()?.availableStart;
    if (!available) return TIMELINE_RANGES[TIMELINE_RANGES.length - 1].minutes;
    const minutes = (Date.now() - new Date(available).getTime()) / 60_000;
    // Always leave the smallest preset reachable, even on a fresh recorder.
    return Math.max(minutes, TIMELINE_RANGES[0].minutes);
  });

  readonly displayTime = computed(() => {
    const dragged = this.dragPct();
    if (dragged !== null) return new Date(this.pctToMs(dragged));
    return this.position() ?? this.now();
  });

  readonly behindLabel = computed(() => {
    const behindSec = Math.max(
      0,
      Math.round((this.now().getTime() - this.displayTime().getTime()) / 1000)
    );
    if (behindSec < 60) return `${behindSec}s`;
    const minutes = Math.floor(behindSec / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(
      2,
      '0'
    )}`;
  });

  readonly playheadPct = computed(() => {
    const dragged = this.dragPct();
    if (dragged !== null) return dragged;
    if (this.live()) return 100;
    const position = this.position();
    if (!position) return 100;
    return this.msToPct(position.getTime());
  });

  readonly liveZonePct = computed(
    () => (this.liveLagSec() * 1000 * 100) / this.spanMs()
  );

  readonly hoverTime = computed(() => {
    const pct = this.hoverPct();
    return pct === null ? null : new Date(this.pctToMs(pct));
  });

  readonly coverage = computed<CoverageBand[]>(() => {
    const runs = this.dvrWindow()?.runs;
    if (!runs?.length) return [];

    const bands: CoverageBand[] = [];
    for (const run of runs) {
      const leftPct = this.msToPct(new Date(run.start).getTime());
      const rightPct = this.msToPct(new Date(run.end).getTime());
      if (rightPct <= 0 || leftPct >= 100) continue;
      const clampedLeft = Math.max(0, leftPct);
      bands.push({
        leftPct: clampedLeft,
        widthPct: Math.min(100, rightPct) - clampedLeft,
      });
    }
    return bands;
  });

  readonly markerPins = computed<MarkerPin[]>(() => {
    const pins: MarkerPin[] = [];
    for (const event of this.markers()) {
      const pct = this.msToPct(new Date(event.timestamp).getTime());
      if (pct < 0 || pct > 100) continue;
      pins.push({
        id: event.id,
        pct,
        color: labelColor(event.label),
        label: event.label,
        time: new Date(event.timestamp).toLocaleTimeString(),
        rating: event.analysis?.overallRating ?? null,
      });
    }
    return pins;
  });

  readonly ticks = computed<Tick[]>(() => {
    const spanMs = this.spanMs();
    const stepMs = this.tickStepMs(spanMs);
    const endMs = this.endMs();
    const startMs = this.startMs();

    const ticks: Tick[] = [];
    // Anchor ticks to wall-clock boundaries so the labels stay round.
    let t = Math.ceil(startMs / stepMs) * stepMs;
    for (; t <= endMs; t += stepMs) {
      const date = new Date(t);
      ticks.push({
        pct: ((t - startMs) / spanMs) * 100,
        label:
          stepMs >= 3_600_000
            ? `${date.getHours()}:00`
            : `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`,
      });
    }
    return ticks;
  });

  ngOnDestroy(): void {
    clearInterval(this.clockTimer);
  }

  onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    this.trackRef().nativeElement.setPointerCapture(event.pointerId);
    this.dragPct.set(this.pctFromEvent(event));
  }

  onPointerMove(event: PointerEvent): void {
    const pct = this.pctFromEvent(event);
    this.hoverPct.set(pct);
    if (this.dragging) {
      this.dragPct.set(pct);
    }
  }

  /**
   * Commit on release rather than during the drag: every seek reloads a
   * chunk of the DVR playlist, so emitting per pointermove would thrash
   * the player for positions the user only passed through.
   */
  onPointerUp(event: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.trackRef().nativeElement.releasePointerCapture(event.pointerId);

    const pct = this.dragPct() ?? this.pctFromEvent(event);
    this.dragPct.set(null);
    this.commit(pct);
  }

  onPointerCancel(): void {
    this.dragging = false;
    this.dragPct.set(null);
  }

  onKeydown(event: KeyboardEvent): void {
    const stepSec =
      event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        ? event.shiftKey
          ? 60
          : 10
        : null;
    if (stepSec === null) return;

    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const from = (this.position() ?? this.now()).getTime();
    this.commit(this.msToPct(from + direction * stepSec * 1000));
  }

  /** Snapping to live inside the trailing dead zone avoids a stuck playhead. */
  private commit(pct: number): void {
    const clamped = Math.min(100, Math.max(0, pct));
    if (clamped >= 100 - this.liveZonePct()) {
      this.goLive.emit();
      return;
    }
    this.seek.emit(new Date(this.pctToMs(clamped)));
  }

  private pctFromEvent(event: PointerEvent): number {
    const rect = this.trackRef().nativeElement.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.min(
      100,
      Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)
    );
  }

  private pctToMs(pct: number): number {
    return this.startMs() + (pct / 100) * this.spanMs();
  }

  private msToPct(ms: number): number {
    return ((ms - this.startMs()) / this.spanMs()) * 100;
  }

  /** Pick a tick interval that yields roughly 6–12 labels across the span. */
  private tickStepMs(spanMs: number): number {
    const candidates = [
      60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000,
      7_200_000, 21_600_000,
    ];
    return (
      candidates.find((step) => spanMs / step <= 12) ??
      candidates[candidates.length - 1]
    );
  }
}
