import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { Paginator, PaginatorState } from 'primeng/paginator';
import {
  AnomalyRating,
  CameraApiService,
  DetectionEvent,
  RecordingStatus,
  SceneEntity,
} from '../../services/camera-api.service';
import { LABEL_OPTIONS, labelColor, labelIcon } from '../../constants/labels';
import { ClipPlayerComponent } from '../../components/clip-player/clip-player.component';
import {
  EventCardComponent,
  EventCardVariant,
} from '../../components/event-card/event-card.component';
import { EventService } from '../../services/event.service';

type EventView = EventCardVariant | 'table';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    Select,
    Paginator,
    ClipPlayerComponent,
    EventCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="events-page">
      <header class="page-header">
        <div class="titles">
          <h1>Events</h1>
          <p>
            Every detection, with the vision model's reading of the scene
            alongside it.
          </p>
        </div>

        <div class="view-rail" role="group" aria-label="View">
          @for (option of views; track option.value) {
          <button
            type="button"
            class="view-btn"
            [class.active]="view() === option.value"
            [title]="option.hint"
            (click)="view.set(option.value)"
          >
            <i class="pi" [class]="option.icon"></i>
            <span>{{ option.label }}</span>
          </button>
          }
        </div>
      </header>

      <div class="filters glass-card">
        <div class="filter">
          <label for="f-label">Label</label>
          <p-select
            inputId="f-label"
            [(ngModel)]="labelFilter"
            [options]="labelOptions"
            placeholder="All"
            (onChange)="reload()"
            [showClear]="true"
            [filter]="true"
            styleClass="filter-select"
            appendTo="body"
          />
        </div>

        <div class="filter">
          <label for="f-conf">Confidence</label>
          <p-select
            inputId="f-conf"
            [(ngModel)]="minConfidenceFilter"
            [options]="confidenceOptions"
            (onChange)="reload()"
            styleClass="filter-select-sm"
            appendTo="body"
          />
        </div>

        <div class="filter">
          <label for="f-rating">AI rating</label>
          <p-select
            inputId="f-rating"
            [(ngModel)]="ratingFilter"
            [options]="ratingOptions"
            placeholder="Any"
            (onChange)="reload()"
            [showClear]="true"
            styleClass="filter-select-sm"
            appendTo="body"
          />
        </div>

        <div class="filter">
          <label for="f-range">Since</label>
          <p-select
            inputId="f-range"
            [(ngModel)]="sinceFilter"
            [options]="sinceOptions"
            (onChange)="reload()"
            styleClass="filter-select-sm"
            appendTo="body"
          />
        </div>

        <button
          type="button"
          class="chip-toggle"
          [class.active]="pinnedOnly"
          (click)="togglePinnedOnly()"
        >
          <i class="pi" [class]="pinnedOnly ? 'pi-bookmark-fill' : 'pi-bookmark'"></i>
          Pinned
        </button>

        <span class="spacer"></span>

        <span class="result-count">
          {{ total() }} {{ total() === 1 ? 'event' : 'events' }}
        </span>

        <button type="button" class="chip-toggle" (click)="reload()" title="Refresh">
          <i class="pi pi-refresh"></i>
        </button>
      </div>

      @if (loading()) {
      <div class="state glass-card">
        <i class="pi pi-spin pi-spinner"></i>
        <p>Loading events…</p>
      </div>
      } @else if (events().length === 0) {
      <div class="state glass-card">
        <i class="pi pi-search"></i>
        <p>No events match these filters</p>
        <button type="button" class="chip-toggle" (click)="clearFilters()">
          Clear filters
        </button>
      </div>
      } @else if (view() === 'table') {

      <!-- Dense table: one row per event, expand for the entity breakdown -->
      <div class="table glass-card">
        <div class="thead">
          <span>Time</span>
          <span>Label</span>
          <span>Confidence</span>
          <span>AI reading</span>
          <span class="center">Rating</span>
          <span class="center">Media</span>
        </div>

        @for (event of events(); track event.id) {
        <div
          class="trow"
          [class.expanded]="expandedId() === event.id"
          (click)="toggleExpand(event)"
        >
          <span class="cell-time">
            {{ event.timestamp | date : 'MMM d, HH:mm:ss' }}
          </span>
          <span class="cell-label">
            <i
              class="pi label-icon"
              [class]="icon(event.label)"
              [style.color]="color(event.label)"
            ></i>
            {{ event.label }}
          </span>
          <span class="cell-conf">
            <span class="bar">
              <span
                class="bar-fill"
                [style.width.%]="event.confidence * 100"
                [style.background]="confidenceColor(event.confidence)"
              ></span>
            </span>
            {{ (event.confidence * 100).toFixed(0) }}%
          </span>
          <span class="cell-summary">
            @if (event.analysis?.description; as description) {
            {{ description }}
            } @else {
            <span class="none">—</span>
            }
          </span>
          <span class="center">
            @if (event.analysis?.overallRating; as rating) {
            <span class="rating" [class]="'rating-' + rating.toLowerCase()">
              {{ rating }} {{ event.analysis!.overallScore }}
            </span>
            } @else {
            <span class="none">—</span>
            }
          </span>
          <span class="center cell-media" (click)="$event.stopPropagation()">
            @if (event.snapshotFilename; as filename) {
            <a
              [href]="snapshotUrl(filename)"
              target="_blank"
              rel="noopener"
              title="Open snapshot"
            >
              <i class="pi pi-image"></i>
            </a>
            } @if (playable(event)) {
            <button
              type="button"
              class="icon-only"
              (click)="playClip(event)"
              title="Play clip"
            >
              <i class="pi pi-play-circle"></i>
            </button>
            }
            <button
              type="button"
              class="icon-only"
              [class.on]="event.pinned"
              (click)="togglePin(event)"
              [title]="event.pinned ? 'Unpin' : 'Pin'"
            >
              <i
                class="pi"
                [class]="event.pinned ? 'pi-bookmark-fill' : 'pi-bookmark'"
              ></i>
            </button>
          </span>
        </div>

        @if (expandedId() === event.id) {
        <div class="tdetail">
          @if (event.snapshotFilename; as filename) {
          <img
            class="detail-thumb"
            [src]="snapshotUrl(filename)"
            [alt]="event.label + ' snapshot'"
            loading="lazy"
          />
          }
          <div class="detail-body">
            @if (event.analysis; as analysis) {
            <p class="detail-summary">{{ analysis.description }}</p>
            @if (analysis.entities?.length) {
            <div class="detail-entities">
              @for (entity of analysis.entities!; track $index) {
              <div class="detail-entity" [class]="'tier-' + tier(entity.anomaly_score)">
                <div class="entity-head">
                  <i class="pi" [class]="entityIcon(entity.type)"></i>
                  <span class="entity-type">{{ entity.type }}</span>
                  <span class="entity-score">{{ entity.anomaly_score }}/10</span>
                </div>
                <div class="entity-desc">{{ entity.description }}</div>
                <div class="entity-meta">
                  <i class="pi pi-map-marker"></i> {{ entity.location }}
                </div>
                <div class="entity-meta">{{ entity.activity }}</div>
                @if (entity.anomaly_reason) {
                <div class="entity-reason">{{ entity.anomaly_reason }}</div>
                }
              </div>
              }
            </div>
            }
            <div class="detail-foot">
              <span>{{ analysis.model }}</span>
              <span>{{ analysis.durationMs }}ms</span>
            </div>
            } @else {
            <p class="detail-summary none">
              No scene analysis was recorded for this event.
            </p>
            }
          </div>
        </div>
        } } @empty {}
      </div>

      } @else {

      <div class="cards" [class.grid]="view() === 'gallery'">
        @for (event of events(); track event.id) {
        <app-event-card
          [event]="event"
          [variant]="cardVariant()"
          [playable]="playable(event)"
          (playClip)="playClip($event)"
          (togglePin)="togglePin($event)"
        />
        }
      </div>

      }

      <p-paginator
        [rows]="pageSize"
        [first]="pageIndex * pageSize"
        [totalRecords]="total()"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onPageChange)="onPageChange($event)"
        [showFirstLastIcon]="true"
      />

      <app-clip-player #clipPlayer />
    </div>
  `,
  styles: `
    .events-page {
      max-width: 1500px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .page-header {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      flex-wrap: wrap;
    }

    .titles {
      flex: 1;
      min-width: 240px;

      h1 {
        font-size: 24px;
        font-weight: 600;
      }

      p {
        font-size: 13px;
        color: var(--text-muted);
        margin-top: 2px;
      }
    }

    .view-rail {
      display: flex;
      gap: 2px;
      padding: 3px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-color);
    }

    .view-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border: none;
      border-radius: 5px;
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: color 0.15s, background 0.15s;

      &:hover {
        color: var(--text-primary);
      }

      &.active {
        background: rgba(59, 130, 246, 0.18);
        color: var(--accent-blue);
      }

      i {
        font-size: 13px;
      }
    }

    .filters {
      display: flex;
      align-items: flex-end;
      gap: 14px;
      padding: 14px 16px;
      flex-wrap: wrap;
    }

    .filter {
      display: flex;
      flex-direction: column;
      gap: 4px;

      label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }
    }

    :host ::ng-deep .filter-select {
      width: 190px;
    }

    :host ::ng-deep .filter-select-sm {
      width: 130px;
    }

    .chip-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-color);
      background: transparent;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;

      &:hover {
        color: var(--text-primary);
        border-color: var(--text-muted);
      }

      &.active {
        color: var(--accent-yellow);
        border-color: rgba(234, 179, 8, 0.4);
        background: rgba(234, 179, 8, 0.1);
      }

      i {
        font-size: 13px;
      }
    }

    .spacer {
      flex: 1;
    }

    .result-count {
      font-size: 12px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }

    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 64px 20px;
      color: var(--text-muted);

      > i {
        font-size: 34px;
        opacity: 0.4;
      }

      p {
        color: var(--text-secondary);
      }
    }

    /* ── card views ── */
    .cards {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .cards.grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
      gap: 14px;
    }

    /* ── table view ── */
    .table {
      overflow: hidden;
    }

    .thead,
    .trow {
      display: grid;
      grid-template-columns: 150px 130px 130px minmax(0, 1fr) 110px 110px;
      gap: 12px;
      align-items: center;
      padding: 10px 16px;
    }

    .thead {
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--border-color);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .trow {
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      cursor: pointer;
      font-size: 13px;

      &:hover {
        background: var(--bg-card-hover);
      }

      &.expanded {
        background: rgba(59, 130, 246, 0.05);
      }
    }

    .center {
      text-align: center;
    }

    .cell-time {
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .cell-label {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      text-transform: capitalize;
      font-weight: 500;
    }

    .label-icon {
      font-size: 13px;
    }

    .cell-conf {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-variant-numeric: tabular-nums;
      color: var(--text-secondary);
      font-size: 12px;
    }

    .bar {
      display: inline-block;
      width: 52px;
      height: 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.06);
      overflow: hidden;
    }

    .bar-fill {
      display: block;
      height: 100%;
      border-radius: 3px;
    }

    .cell-summary {
      color: var(--text-secondary);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .none {
      color: var(--text-muted);
    }

    .rating {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;

      &.rating-low {
        background: rgba(34, 197, 94, 0.14);
        color: var(--accent-green);
      }
      &.rating-medium {
        background: rgba(234, 179, 8, 0.14);
        color: var(--accent-yellow);
      }
      &.rating-high {
        background: rgba(239, 68, 68, 0.16);
        color: var(--accent-red);
      }
    }

    .cell-media {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 2px;

      a {
        display: inline-flex;
        padding: 4px;
        color: var(--text-muted);

        &:hover {
          color: var(--accent-blue);
        }
      }

      i {
        font-size: 15px;
      }
    }

    .icon-only {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;

      &:hover {
        color: var(--accent-blue);
      }

      &.on {
        color: var(--accent-yellow);
      }
    }

    .tdetail {
      display: flex;
      gap: 16px;
      padding: 14px 16px 18px;
      background: rgba(59, 130, 246, 0.04);
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .detail-thumb {
      width: 260px;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: var(--radius-sm);
      background: #000;
      flex-shrink: 0;
    }

    .detail-body {
      flex: 1;
      min-width: 0;
    }

    .detail-summary {
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .detail-entities {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 8px;
    }

    .detail-entity {
      padding: 9px 11px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);

      &.tier-medium {
        border-color: rgba(234, 179, 8, 0.3);
      }
      &.tier-high {
        border-color: rgba(239, 68, 68, 0.35);
      }
    }

    .entity-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 5px;

      i {
        font-size: 12px;
        color: #a855f7;
      }
    }

    .entity-type {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
      text-transform: capitalize;
    }

    .entity-score {
      font-size: 11px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }

    .entity-desc {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 3px;
    }

    .entity-meta {
      font-size: 11px;
      color: var(--text-muted);

      i {
        font-size: 10px;
      }
    }

    .entity-reason {
      font-size: 11px;
      font-style: italic;
      color: var(--text-muted);
      border-top: 1px solid var(--border-color);
      margin-top: 5px;
      padding-top: 5px;
    }

    .detail-foot {
      display: flex;
      gap: 12px;
      margin-top: 10px;
      font-size: 11px;
      color: var(--text-muted);
      font-family: monospace;
    }

    @media (max-width: 1000px) {
      .thead {
        display: none;
      }

      .trow {
        grid-template-columns: 1fr 1fr;
        row-gap: 6px;
      }

      .cell-summary {
        grid-column: 1 / -1;
        white-space: normal;
      }

      .tdetail {
        flex-direction: column;
      }

      .detail-thumb {
        width: 100%;
      }
    }
  `,
})
export class EventsComponent implements OnInit {
  private readonly api = inject(CameraApiService);
  private readonly eventService = inject(EventService);

  private readonly clipPlayer =
    viewChild.required<ClipPlayerComponent>('clipPlayer');

  readonly events = signal<DetectionEvent[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly expandedId = signal<string | null>(null);
  readonly recordingStatus = signal<RecordingStatus | null>(null);
  readonly view = signal<EventView>('detail');

  /** The card views share one component; `table` renders its own markup. */
  readonly cardVariant = computed<EventCardVariant>(() => {
    const view = this.view();
    return view === 'table' ? 'detail' : view;
  });

  labelFilter: string | null = null;
  minConfidenceFilter = 0;
  ratingFilter: AnomalyRating | null = null;
  sinceFilter = 0;
  pinnedOnly = false;
  pageSize = 50;
  pageIndex = 0;

  readonly labelOptions = LABEL_OPTIONS;
  readonly color = labelColor;
  readonly icon = labelIcon;

  readonly views: {
    value: EventView;
    label: string;
    icon: string;
    hint: string;
  }[] = [
    {
      value: 'compact',
      label: 'Compact',
      icon: 'pi-bars',
      hint: 'One dense line per event',
    },
    {
      value: 'detail',
      label: 'Cards',
      icon: 'pi-list',
      hint: 'Thumbnail with the AI summary and entities',
    },
    {
      value: 'table',
      label: 'Table',
      icon: 'pi-table',
      hint: 'Sortable columns, expand a row for detail',
    },
    {
      value: 'gallery',
      label: 'Gallery',
      icon: 'pi-th-large',
      hint: 'Snapshot-first grid',
    },
  ];

  readonly confidenceOptions = [
    { label: 'Any', value: 0 },
    { label: '50%+', value: 0.5 },
    { label: '70%+', value: 0.7 },
    { label: '90%+', value: 0.9 },
  ];

  readonly ratingOptions = [
    { label: 'Low', value: 'LOW' },
    { label: 'Medium', value: 'MEDIUM' },
    { label: 'High', value: 'HIGH' },
  ];

  readonly sinceOptions = [
    { label: 'All time', value: 0 },
    { label: 'Last hour', value: 1 },
    { label: 'Last 24 hours', value: 24 },
    { label: 'Last 7 days', value: 168 },
  ];

  ngOnInit(): void {
    this.reload();
    this.api.getRecordingStatus().subscribe({
      next: (status) => this.recordingStatus.set(status),
      error: () => this.recordingStatus.set(null),
    });
  }

  reload(): void {
    this.loading.set(true);
    this.expandedId.set(null);

    this.api
      .getDetections({
        limit: this.pageSize,
        offset: this.pageIndex * this.pageSize,
        label: this.labelFilter || undefined,
        minConfidence: this.minConfidenceFilter || undefined,
        rating: this.ratingFilter || undefined,
        pinnedOnly: this.pinnedOnly || undefined,
        since: this.sinceFilter
          ? new Date(Date.now() - this.sinceFilter * 3_600_000).toISOString()
          : undefined,
        includeAnalysis: true,
      })
      .subscribe({
        next: (res) => {
          this.events.set(res.events);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to load events:', err);
          this.events.set([]);
          this.total.set(0);
          this.loading.set(false);
        },
      });
  }

  onPageChange(event: PaginatorState): void {
    this.pageSize = event.rows ?? this.pageSize;
    this.pageIndex = event.page ?? 0;
    this.reload();
  }

  togglePinnedOnly(): void {
    this.pinnedOnly = !this.pinnedOnly;
    this.pageIndex = 0;
    this.reload();
  }

  clearFilters(): void {
    this.labelFilter = null;
    this.minConfidenceFilter = 0;
    this.ratingFilter = null;
    this.sinceFilter = 0;
    this.pinnedOnly = false;
    this.pageIndex = 0;
    this.reload();
  }

  toggleExpand(event: DetectionEvent): void {
    this.expandedId.set(this.expandedId() === event.id ? null : event.id);
  }

  /** True when recorded video still covers this event's timestamp. */
  playable(event: DetectionEvent): boolean {
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

  togglePin(event: DetectionEvent): void {
    this.api.togglePinEvent(event.id).subscribe({
      next: (updated) => {
        this.events.update((events) =>
          events.map((e) =>
            e.id === updated.id ? { ...updated, analysis: e.analysis } : e
          )
        );
        this.eventService.patch(updated);
      },
    });
  }

  snapshotUrl(filename: string): string {
    return this.api.getSnapshotUrl(filename);
  }

  confidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'var(--accent-green)';
    if (confidence >= 0.6) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
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
