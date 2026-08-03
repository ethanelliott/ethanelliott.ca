import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  CameraApiService,
  DetectionEvent,
  SceneEntity,
  ThreatLevel,
} from '../../services/camera-api.service';
import {
  activityLabel,
  labelColor,
  labelIcon,
  triggerLabel,
} from '../../constants/labels';

/**
 * How much of an event to show.
 *
 * `compact` is one scannable line, `detail` leads with the AI reading of the
 * scene, `gallery` leads with the frame itself. All three render the same
 * data — which one reads best depends on how the camera is actually used.
 */
export type EventCardVariant = 'compact' | 'detail' | 'gallery';

@Component({
  selector: 'app-event-card',
  standalone: true,
  imports: [CommonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="card"
      [class]="'variant-' + variant()"
      [class.pinned]="event().pinned"
      [class.selected]="selected()"
      [style.--label-color]="accent()"
      (click)="activate.emit(event())"
    >
      @if (variant() !== 'compact') {
      <div class="thumb">
        @if (event().snapshotFilename; as filename) {
        <img
          [src]="snapshotUrl(filename)"
          [alt]="event().label + ' detection'"
          loading="lazy"
          decoding="async"
        />
        } @else {
        <div class="thumb-empty"><i class="pi pi-image"></i></div>
        }
        <span class="thumb-label">
          <i class="pi" [class]="icon()"></i>
          {{ event().label }}
        </span>
      </div>
      }

      <div class="body">
        <div class="row-top">
          @if (variant() === 'compact') {
          <span class="dot"></span>
          <span class="label">{{ event().label }}</span>
          }

          <span class="confidence">{{ confidencePct() }}%</span>

          @if (threat(); as level) {
          <span class="rating" [class]="'threat-' + level">
            {{ level }}
          </span>
          } @else if (variant() !== 'compact') {
          <span class="rating rating-pending">
            <i class="pi pi-sparkles"></i>
            no analysis
          </span>
          } @if (activityLabel(); as activity) {
          <span class="activity">{{ activity }}</span>
          } @if (analysis()?.notified) {
          <span class="notified" title="A push notification was sent">
            <i class="pi pi-bell"></i>
          </span>
          }

          <span class="spacer"></span>

          <time class="time" [attr.datetime]="event().timestamp">
            {{ event().timestamp | date : timeFormat() }}
          </time>
        </div>

        @if (analysis()?.description; as description) {
        <p class="summary">{{ description }}</p>
        }

        <!-- The conditions the model matched: what a notification rule fires
             on, so they are worth showing even when nothing was sent. -->
        @if (variant() !== 'compact' && triggers().length) {
        <div class="triggers">
          @for (trigger of triggers(); track trigger) {
          <span class="trigger">{{ trigger }}</span>
          }
        </div>
        }

        @if (variant() === 'detail' && analysis()?.entities?.length) {
        <div class="entities">
          @for (entity of analysis()!.entities!; track $index) {
          <span
            class="entity"
            [class]="'tier-' + tier(entity.anomaly_score)"
            [title]="entity.anomaly_reason || entity.activity"
          >
            <i class="pi" [class]="entityIcon(entity.type)"></i>
            <span class="entity-text">{{ entity.description }}</span>
            <span class="entity-where">{{ entity.location }}</span>
          </span>
          }
        </div>
        }
      </div>

      <div class="actions" (click)="$event.stopPropagation()">
        @if (playable()) {
        <button
          type="button"
          class="action"
          (click)="playClip.emit(event())"
          title="Play recorded clip"
        >
          <i class="pi pi-play-circle"></i>
        </button>
        }
        <button
          type="button"
          class="action"
          [class.on]="event().pinned"
          (click)="togglePin.emit(event())"
          [title]="event().pinned ? 'Unpin' : 'Pin (exempt from cleanup)'"
        >
          <i
            class="pi"
            [class]="event().pinned ? 'pi-bookmark-fill' : 'pi-bookmark'"
          ></i>
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      /* Cards adapt to their container, not the viewport: the same 'detail'
         card renders in a 380px rail and in a full-width list. */
      container-type: inline-size;
      height: 100%;
    }

    .card {
      position: relative;
      display: flex;
      height: 100%;
      gap: 12px;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, transform 0.15s;

      &:hover {
        background: var(--bg-card-hover);
        border-color: color-mix(in srgb, var(--label-color) 45%, transparent);
      }

      &.selected {
        border-color: var(--label-color);
      }

      &.pinned::after {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        border-radius: var(--radius-md) 0 0 var(--radius-md);
        background: var(--accent-yellow);
      }
    }

    /* ── compact: one dense line ── */
    .variant-compact {
      align-items: center;
      padding: 8px 10px;
      gap: 8px;
    }

    .variant-compact .body {
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }

    .variant-compact .row-top {
      flex: 0 0 auto;
      flex-wrap: nowrap;
    }

    /* The summary only earns its place once the row is wide enough to hold it
       on one line — in a narrow rail it would wrap and break the density. */
    .variant-compact .summary {
      display: none;
    }

    @container (min-width: 620px) {
      .variant-compact .summary {
        display: block;
        flex: 1;
        min-width: 0;
        -webkit-line-clamp: 1;
        line-clamp: 1;
        margin-left: 4px;
      }

      .variant-compact .row-top .spacer {
        display: none;
      }
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--label-color);
    }

    .label {
      font-weight: 600;
      text-transform: capitalize;
      font-size: 13px;
    }

    /* ── detail: AI reading leads ── */
    .variant-detail {
      padding: 10px;
    }

    .variant-detail .thumb {
      width: 148px;
      flex-shrink: 0;
    }

    /* In a narrow rail a full-width thumbnail costs ~200px of height and
       drops the card count to two or three. Shrink the frame to a glance and
       spend the space on the summary instead — the entity breakdown is the
       first thing worth dropping, since the table view carries it in full. */
    @container (max-width: 460px) {
      .variant-detail .thumb {
        width: 92px;
        align-self: flex-start;
      }

      .variant-detail .thumb-label {
        left: 4px;
        bottom: 4px;
        padding: 1px 5px;
        font-size: 9px;
        gap: 3px;

        i {
          font-size: 9px;
        }
      }

      .variant-detail .entities {
        display: none;
      }

      .variant-detail .summary {
        -webkit-line-clamp: 3;
        line-clamp: 3;
      }
    }

    /* ── gallery: the frame leads ── */
    .variant-gallery {
      flex-direction: column;
      gap: 0;
      overflow: hidden;

      &:hover {
        transform: translateY(-2px);
      }
    }

    .variant-gallery .thumb {
      width: 100%;
      border-radius: 0;
    }

    .variant-gallery .body {
      padding: 10px 12px 12px;
    }

    .variant-gallery .actions {
      position: absolute;
      top: 6px;
      right: 6px;
      background: rgba(0, 0, 0, 0.55);
      border-radius: var(--radius-sm);
      backdrop-filter: blur(6px);
    }

    .variant-gallery .summary {
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }

    /* ── shared parts ── */
    .thumb {
      position: relative;
      aspect-ratio: 16 / 9;
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: #000;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    }

    .thumb-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);

      i {
        font-size: 22px;
        opacity: 0.4;
      }
    }

    .thumb-label {
      position: absolute;
      left: 6px;
      bottom: 6px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      text-transform: capitalize;
      color: #fff;
      background: color-mix(in srgb, var(--label-color) 80%, transparent);

      i {
        font-size: 11px;
      }
    }

    .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .row-top {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
    }

    .confidence {
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      padding: 1px 6px;
      border-radius: 8px;
      color: var(--label-color);
      background: color-mix(in srgb, var(--label-color) 15%, transparent);
    }

    .rating {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 1px 7px;
      border-radius: 8px;

      text-transform: uppercase;

      &.threat-benign {
        background: rgba(148, 163, 184, 0.14);
        color: #94a3b8;
      }
      &.threat-notable {
        background: rgba(34, 197, 94, 0.14);
        color: var(--accent-green);
      }
      &.threat-suspicious {
        background: rgba(234, 179, 8, 0.16);
        color: var(--accent-yellow);
      }
      &.threat-critical {
        background: rgba(239, 68, 68, 0.18);
        color: var(--accent-red);
      }
      &.rating-pending {
        text-transform: none;
        background: rgba(255, 255, 255, 0.04);
        color: var(--text-muted);
        font-weight: 500;
        letter-spacing: 0;
      }

      i {
        font-size: 10px;
      }
    }

    .activity {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .notified {
      display: inline-flex;
      color: var(--accent-blue);

      i {
        font-size: 11px;
      }
    }

    .triggers {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .trigger {
      padding: 1px 7px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 500;
      color: var(--accent-yellow);
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.25);
    }

    .spacer {
      flex: 1;
    }

    .time {
      font-size: 11px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .summary {
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-secondary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .entities {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 1px;
    }

    .entity {
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      max-width: 100%;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 11px;
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.035);
      border-left: 2px solid var(--border-color);

      &.tier-medium {
        border-left-color: rgba(234, 179, 8, 0.55);
      }
      &.tier-high {
        border-left-color: rgba(239, 68, 68, 0.6);
        background: rgba(239, 68, 68, 0.06);
      }

      i {
        font-size: 10px;
        color: #a855f7;
      }
    }

    .entity-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .entity-where {
      color: var(--text-muted);
      font-size: 10px;
      white-space: nowrap;
    }

    .actions {
      display: flex;
      align-items: flex-start;
      gap: 2px;
      flex-shrink: 0;
    }

    .action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s, color 0.15s, background 0.15s;

      &:hover {
        background: rgba(255, 255, 255, 0.07);
        color: var(--text-primary);
      }

      &.on {
        opacity: 1;
        color: var(--accent-yellow);
      }

      i {
        font-size: 14px;
      }
    }

    .card:hover .action,
    .action:focus-visible {
      opacity: 1;
    }

    @media (hover: none) {
      .action {
        opacity: 1;
      }
    }
  `,
})
export class EventCardComponent {
  private readonly api = inject(CameraApiService);

  readonly event = input.required<DetectionEvent>();
  readonly variant = input<EventCardVariant>('detail');
  readonly selected = input(false);
  /** Whether recorded video still covers this event's timestamp. */
  readonly playable = input(false);

  readonly activate = output<DetectionEvent>();
  readonly playClip = output<DetectionEvent>();
  readonly togglePin = output<DetectionEvent>();

  readonly analysis = computed(() => this.event().analysis ?? null);

  /**
   * Rows written before the taxonomy existed carry only a LOW/MEDIUM/HIGH
   * rating, so map those forward rather than showing them as unanalysed.
   */
  readonly threat = computed<ThreatLevel | null>(() => {
    const analysis = this.analysis();
    if (!analysis) return null;
    if (analysis.threat) return analysis.threat;
    if (!analysis.overallRating) return null;
    return { LOW: 'benign', MEDIUM: 'suspicious', HIGH: 'critical' }[
      analysis.overallRating
    ] as ThreatLevel;
  });

  readonly activityLabel = computed(() => {
    const activity = this.analysis()?.activity;
    // 'nothing_notable' adds nothing next to a summary that says the same.
    return activity && activity !== 'nothing_notable'
      ? activityLabel(activity)
      : null;
  });

  readonly triggers = computed(() =>
    (this.analysis()?.triggers ?? []).map(triggerLabel)
  );

  readonly accent = computed(() => labelColor(this.event().label));
  readonly icon = computed(() => labelIcon(this.event().label));
  readonly confidencePct = computed(() =>
    (this.event().confidence * 100).toFixed(0)
  );
  readonly timeFormat = computed(() =>
    this.variant() === 'compact' ? 'HH:mm:ss' : 'MMM d, HH:mm:ss'
  );

  snapshotUrl(filename: string): string {
    return this.api.getSnapshotUrl(filename);
  }

  tier(score: number): 'low' | 'medium' | 'high' {
    if (score <= 3) return 'low';
    if (score <= 6) return 'medium';
    return 'high';
  }

  entityIcon(type: SceneEntity['type']): string {
    const icons: Record<string, string> = {
      person: 'pi-user',
      vehicle: 'pi-car',
      animal: 'pi-heart',
      object: 'pi-box',
    };
    return icons[type] ?? 'pi-eye';
  }
}
