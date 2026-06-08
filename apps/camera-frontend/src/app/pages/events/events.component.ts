import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { ButtonDirective } from 'primeng/button';
import {
  CameraApiService,
  DetectionEvent,
  SceneAnalysis,
  SceneEntity,
  AnomalyRating,
} from '../../services/camera-api.service';
import { LABEL_OPTIONS } from '../../constants/labels';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    Select,
    Paginator,
    ButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="events-page">
      <h1 class="page-title">Detection Events</h1>

      <!-- Filters -->
      <div class="filters glass-card">
        <div class="filter-field">
          <label>Label</label>
          <p-select
            [(ngModel)]="labelFilter"
            [options]="labelOptions"
            placeholder="All"
            (onChange)="loadEvents()"
            [showClear]="true"
            styleClass="filter-select"
            appendTo="body"
          />
        </div>

        <div class="filter-field">
          <label>Min Confidence</label>
          <p-select
            [(ngModel)]="minConfidenceFilter"
            [options]="confidenceOptions"
            (onChange)="loadEvents()"
            styleClass="filter-select"
            appendTo="body"
          />
        </div>

        <button
          pButton
          [outlined]="true"
          icon="pi pi-refresh"
          label="Refresh"
          (click)="loadEvents()"
        ></button>
      </div>

      <!-- Events Table -->
      <div class="events-table glass-card">
        <div class="table-header">
          <span class="col-time">Time</span>
          <span class="col-label">Label</span>
          <span class="col-confidence">Confidence</span>
          <span class="col-analysis">Analysis</span>
          <span class="col-snapshot">Snapshot</span>
        </div>

        @for (event of events(); track event.id) {
        <div
          class="table-row"
          (click)="toggleExpand(event.id)"
          [class.expandable]="analysisCache.has(event.id)"
        >
          <span class="col-time">
            {{ event.timestamp | date : 'MMM d, HH:mm:ss' }}
          </span>
          <span class="col-label">
            <span class="event-label-badge">{{ event.label }}</span>
          </span>
          <span class="col-confidence">
            <span class="confidence-bar">
              <span
                class="confidence-fill"
                [style.width.%]="event.confidence * 100"
                [style.background]="getConfidenceColor(event.confidence)"
              ></span>
            </span>
            {{ (event.confidence * 100).toFixed(1) }}%
          </span>
          <span class="col-analysis">
            @if (analysisCache.has(event.id)) {
            <span class="analysis-badge">
              <i class="pi pi-sparkles"></i>
              AI
            </span>
            } @else if (loadingAnalysis().has(event.id)) {
            <i class="pi pi-spin pi-spinner analysis-loading"></i>
            } @else {
            <button
              pButton
              [text]="true"
              icon="pi pi-sparkles"
              class="load-analysis-btn"
              (click)="loadAnalysis(event.id); $event.stopPropagation()"
            ></button>
            }
          </span>
          <span class="col-snapshot">
            @if (event.snapshotFilename) {
            <a
              [href]="getSnapshotUrl(event.snapshotFilename)"
              target="_blank"
              class="snapshot-link"
              (click)="$event.stopPropagation()"
            >
              <i class="pi pi-image"></i>
            </a>
            } @else {
            <i class="pi pi-minus no-snapshot"></i>
            }
          </span>
        </div>
        @if (expandedId() === event.id && analysisCache.has(event.id)) {
        <div class="analysis-row">
          <div class="analysis-content">
            <div class="analysis-header">
              <i class="pi pi-sparkles"></i>
              <span>Scene Analysis</span>
              @if (analysisCache.get(event.id)!.overallRating; as rating) {
              <span class="rating-badge" [class]="'rating-' + rating.toLowerCase()">
                {{ rating }}
              </span>
              <span class="overall-score">
                {{ analysisCache.get(event.id)!.overallScore }}/10
              </span>
              }
              <span class="spacer"></span>
              <span class="analysis-model">{{ analysisCache.get(event.id)!.model }}</span>
              <span class="analysis-duration">{{ analysisCache.get(event.id)!.durationMs }}ms</span>
            </div>

            <p class="analysis-description">{{ analysisCache.get(event.id)!.description }}</p>

            @if (analysisCache.get(event.id)!.entities?.length) {
            <div class="entities-grid">
              @for (entity of analysisCache.get(event.id)!.entities!; track $index) {
              <div class="entity-card" [class]="'score-' + getScoreTier(entity.anomaly_score)">
                <div class="entity-header">
                  <i class="pi" [class]="getEntityIcon(entity.type)"></i>
                  <span class="entity-type">{{ entity.type }}</span>
                  <span class="entity-score" [class]="'score-badge-' + getScoreTier(entity.anomaly_score)">
                    {{ entity.anomaly_score }}/10
                  </span>
                </div>
                <div class="entity-location">
                  <i class="pi pi-map-marker"></i> {{ entity.location }}
                </div>
                <div class="entity-activity">{{ entity.activity }}</div>
                @if (entity.anomaly_reason) {
                <div class="entity-reason">{{ entity.anomaly_reason }}</div>
                }
              </div>
              }
            </div>
            }
          </div>
        </div>
        } } @empty {
        <div class="empty-row">
          <i class="pi pi-search empty-icon"></i>
          <p>No events found</p>
        </div>
        }

        <p-paginator
          [rows]="pageSize"
          [totalRecords]="totalEvents()"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onPageChange)="onPageChange($event)"
          [showFirstLastIcon]="true"
        />
      </div>
    </div>
  `,
  styles: `
    .events-page {
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 20px;
    }

    .filters {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .filter-field {
      display: flex;
      flex-direction: column;
      gap: 4px;

      label {
        font-size: 12px;
        color: var(--text-muted);
      }
    }

    :host ::ng-deep .filter-select {
      width: 180px;
    }

    .events-table {
      overflow: visible;
    }

    .table-header {
      display: grid;
      grid-template-columns: 180px 120px 160px 1fr 60px;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .table-row {
      display: grid;
      grid-template-columns: 180px 120px 160px 1fr 60px;
      gap: 12px;
      padding: 10px 16px;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      cursor: pointer;

      &:hover {
        background: var(--bg-card-hover);
      }

      &.expandable {
        cursor: pointer;
      }
    }

    .analysis-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(168, 85, 247, 0.15);
      color: #a855f7;

      i { font-size: 12px; }
    }

    .analysis-loading {
      color: #a855f7;
      font-size: 16px;
    }

    .load-analysis-btn {
      font-size: 14px !important;
      padding: 4px !important;
      color: var(--text-muted) !important;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .table-row:hover .load-analysis-btn {
      opacity: 1;
    }

    .analysis-row {
      padding: 0 16px 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      background: rgba(168, 85, 247, 0.03);
    }

    .analysis-content {
      padding: 12px;
      border-radius: var(--radius-sm);
      border-left: 3px solid #a855f7;
      background: rgba(168, 85, 247, 0.06);
    }

    .analysis-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #a855f7;

      i { font-size: 14px; }
    }

    .analysis-model {
      font-weight: 400;
      color: var(--text-muted);
      font-family: monospace;
      font-size: 11px;
    }

    .analysis-duration {
      font-weight: 400;
      color: var(--text-muted);
      font-size: 11px;
    }

    .analysis-description {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 12px;
    }

    .spacer { flex: 1; }

    .rating-badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      &.rating-low  { background: rgba(34, 197, 94, 0.15); color: var(--accent-green); }
      &.rating-medium { background: rgba(234, 179, 8, 0.15); color: var(--accent-yellow); }
      &.rating-high { background: rgba(239, 68, 68, 0.15); color: var(--accent-red); }
    }

    .overall-score {
      font-size: 11px;
      color: var(--text-muted);
    }

    .entities-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }

    .entity-card {
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      &.score-medium { border-color: rgba(234, 179, 8, 0.3); }
      &.score-high   { border-color: rgba(239, 68, 68, 0.35); }
    }

    .entity-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      i { color: #a855f7; font-size: 13px; }
    }

    .entity-type {
      font-size: 12px;
      font-weight: 600;
      text-transform: capitalize;
      flex: 1;
    }

    .entity-score {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 8px;
      &.score-badge-low    { background: rgba(34, 197, 94, 0.12); color: var(--accent-green); }
      &.score-badge-medium { background: rgba(234, 179, 8, 0.12); color: var(--accent-yellow); }
      &.score-badge-high   { background: rgba(239, 68, 68, 0.12); color: var(--accent-red); }
    }

    .entity-location {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 3px;
      i { font-size: 10px; }
    }

    .entity-activity {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 3px;
    }

    .entity-reason {
      font-size: 11px;
      color: var(--text-muted);
      font-style: italic;
      border-top: 1px solid var(--border-color);
      margin-top: 4px;
      padding-top: 4px;
    }

    .event-label-badge {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent-blue);
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      text-transform: capitalize;
    }

    .confidence-bar {
      display: inline-block;
      width: 60px;
      height: 6px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      overflow: hidden;
      margin-right: 8px;
      vertical-align: middle;
    }

    .confidence-fill {
      display: block;
      height: 100%;
      border-radius: 3px;
    }

    .mono {
      font-family: monospace;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .snapshot-link {
      color: var(--accent-blue);
      i { font-size: 18px; }
    }

    .no-snapshot {
      color: var(--text-muted);
      font-size: 18px;
    }

    .empty-row {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px;
      color: var(--text-muted);
    }

    .empty-icon {
      font-size: 40px;
      opacity: 0.4;
    }
  `,
})
export class EventsComponent implements OnInit {
  private readonly api = inject(CameraApiService);

  readonly events = signal<DetectionEvent[]>([]);
  readonly totalEvents = signal(0);
  readonly expandedId = signal<string | null>(null);
  readonly loadingAnalysis = signal<Set<string>>(new Set());

  /** Cache of fetched analyses keyed by detectionEventId */
  readonly analysisCache = new Map<string, SceneAnalysis>();

  labelFilter: string | null = null;
  minConfidenceFilter = 0;
  pageSize = 50;
  pageIndex = 0;

  readonly labelOptions = LABEL_OPTIONS;

  readonly confidenceOptions = [
    { label: 'Any', value: 0 },
    { label: '50%+', value: 0.5 },
    { label: '70%+', value: 0.7 },
    { label: '90%+', value: 0.9 },
  ];

  ngOnInit(): void {
    this.loadEvents();
  }

  loadEvents(): void {
    this.expandedId.set(null);
    this.api
      .getDetections({
        limit: this.pageSize,
        offset: this.pageIndex * this.pageSize,
        label: this.labelFilter || undefined,
        minConfidence: this.minConfidenceFilter || undefined,
      })
      .subscribe({
        next: (res) => {
          this.events.set(res.events);
          this.totalEvents.set(res.total);
        },
        error: (err) => console.error('Failed to load events:', err),
      });
  }

  onPageChange(event: PaginatorState): void {
    this.pageSize = event.rows ?? this.pageSize;
    this.pageIndex = event.page ?? 0;
    this.loadEvents();
  }

  getSnapshotUrl(filename: string): string {
    return this.api.getSnapshotUrl(filename);
  }

  toggleExpand(eventId: string): void {
    if (this.expandedId() === eventId) {
      this.expandedId.set(null);
    } else {
      this.expandedId.set(eventId);
      // Auto-load analysis if not cached
      if (!this.analysisCache.has(eventId)) {
        this.loadAnalysis(eventId);
      }
    }
  }

  loadAnalysis(eventId: string): void {
    if (this.analysisCache.has(eventId)) return;
    const loading = new Set(this.loadingAnalysis());
    loading.add(eventId);
    this.loadingAnalysis.set(loading);

    this.api.getAnalysisByDetection(eventId).subscribe({
      next: (analysis) => {
        this.analysisCache.set(eventId, analysis);
        const l = new Set(this.loadingAnalysis());
        l.delete(eventId);
        this.loadingAnalysis.set(l);
        this.expandedId.set(eventId);
      },
      error: () => {
        const l = new Set(this.loadingAnalysis());
        l.delete(eventId);
        this.loadingAnalysis.set(l);
      },
    });
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'var(--accent-green)';
    if (confidence >= 0.6) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
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
}
