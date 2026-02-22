import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import {
  CameraApiService,
  DetectionEvent,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="events-page">
      <h1 class="page-title">Detection Events</h1>

      <!-- Filters -->
      <div class="filters glass-card">
        <mat-form-field appearance="outline">
          <mat-label>Label</mat-label>
          <mat-select
            [(ngModel)]="labelFilter"
            (selectionChange)="loadEvents()"
          >
            <mat-option value="">All</mat-option>
            <mat-option value="person">Person</mat-option>
            <mat-option value="car">Car</mat-option>
            <mat-option value="truck">Truck</mat-option>
            <mat-option value="bicycle">Bicycle</mat-option>
            <mat-option value="cat">Cat</mat-option>
            <mat-option value="dog">Dog</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Min Confidence</mat-label>
          <mat-select
            [(ngModel)]="minConfidenceFilter"
            (selectionChange)="loadEvents()"
          >
            <mat-option [value]="0">Any</mat-option>
            <mat-option [value]="0.5">50%+</mat-option>
            <mat-option [value]="0.7">70%+</mat-option>
            <mat-option [value]="0.9">90%+</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-stroked-button (click)="loadEvents()">
          <mat-icon>refresh</mat-icon>
          Refresh
        </button>
      </div>

      <!-- Events Table -->
      <div class="events-table glass-card">
        <div class="table-header">
          <span class="col-time">Time</span>
          <span class="col-label">Label</span>
          <span class="col-confidence">Confidence</span>
          <span class="col-bbox">Bounding Box</span>
          <span class="col-snapshot">Snapshot</span>
        </div>

        @for (event of events(); track event.id) {
        <div class="table-row">
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
          <span class="col-bbox mono">
            {{ event.bbox.x.toFixed(0) }},{{ event.bbox.y.toFixed(0) }}
            {{ event.bbox.width.toFixed(0) }}×{{ event.bbox.height.toFixed(0) }}
          </span>
          <span class="col-snapshot">
            @if (event.snapshotFilename) {
            <a
              [href]="getSnapshotUrl(event.snapshotFilename)"
              target="_blank"
              class="snapshot-link"
            >
              <mat-icon>photo</mat-icon>
            </a>
            } @else {
            <mat-icon class="no-snapshot">remove</mat-icon>
            }
          </span>
        </div>
        } @empty {
        <div class="empty-row">
          <mat-icon>search_off</mat-icon>
          <p>No events found</p>
        </div>
        }

        <mat-paginator
          [length]="totalEvents()"
          [pageSize]="pageSize"
          [pageSizeOptions]="[25, 50, 100]"
          (page)="onPageChange($event)"
          showFirstLastButtons
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
      align-items: center;
      gap: 16px;
      padding: 16px;
      margin-bottom: 20px;

      mat-form-field {
        width: 180px;
      }
    }

    .events-table {
      overflow: hidden;
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

      &:hover {
        background: var(--bg-card-hover);
      }
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
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .no-snapshot {
      color: var(--text-muted);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .empty-row {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px;
      color: var(--text-muted);

      mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        opacity: 0.4;
      }
    }
  `,
})
export class EventsComponent implements OnInit {
  private readonly api = inject(CameraApiService);

  readonly events = signal<DetectionEvent[]>([]);
  readonly totalEvents = signal(0);

  labelFilter = '';
  minConfidenceFilter = 0;
  pageSize = 50;
  pageIndex = 0;

  ngOnInit(): void {
    this.loadEvents();
  }

  loadEvents(): void {
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

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.loadEvents();
  }

  getSnapshotUrl(filename: string): string {
    return this.api.getSnapshotUrl(filename);
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'var(--accent-green)';
    if (confidence >= 0.6) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
  }
}
