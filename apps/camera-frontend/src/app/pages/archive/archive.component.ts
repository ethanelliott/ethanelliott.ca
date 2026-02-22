import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { ButtonDirective } from 'primeng/button';
import { SnapshotGalleryComponent } from '../../components/snapshot-gallery/snapshot-gallery.component';
import {
  CameraApiService,
  SnapshotInfo,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    Select,
    Paginator,
    ButtonDirective,
    SnapshotGalleryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="archive-page">
      <div class="page-header">
        <h1 class="page-title">Snapshot Archive</h1>
        <span class="spacer"></span>
        <button
          pButton
          [outlined]="true"
          icon="pi pi-refresh"
          label="Refresh"
          (click)="loadSnapshots()"
        ></button>
      </div>

      <!-- Filters -->
      <div class="filters glass-card">
        <div class="filter-field">
          <label>Filter by Label</label>
          <p-select
            [(ngModel)]="labelFilter"
            [options]="labelOptions"
            placeholder="All"
            (onChange)="loadSnapshots()"
            [showClear]="true"
            styleClass="filter-select"
          />
        </div>

        <span class="total-count">
          {{ totalSnapshots() }} snapshots total
        </span>
      </div>

      <app-snapshot-gallery [snapshots]="snapshots" />

      <p-paginator
        [rows]="pageSize"
        [totalRecords]="totalSnapshots()"
        [rowsPerPageOptions]="[24, 48, 96]"
        (onPageChange)="onPageChange($event)"
        [showFirstLastIcon]="true"
      />
    </div>
  `,
  styles: `
    .archive-page {
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
    }

    .page-title {
      font-size: 24px;
      font-weight: 600;
    }

    .spacer {
      flex: 1;
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

    .total-count {
      color: var(--text-muted);
      font-size: 13px;
    }
  `,
})
export class ArchiveComponent implements OnInit {
  private readonly api = inject(CameraApiService);

  readonly snapshots = signal<SnapshotInfo[]>([]);
  readonly totalSnapshots = signal(0);

  labelFilter: string | null = null;
  pageSize = 48;
  pageIndex = 0;

  readonly labelOptions = [
    { label: 'Person', value: 'person' },
    { label: 'Car', value: 'car' },
    { label: 'Cat', value: 'cat' },
    { label: 'Dog', value: 'dog' },
  ];

  ngOnInit(): void {
    this.loadSnapshots();
  }

  loadSnapshots(): void {
    this.api
      .getSnapshots({
        limit: this.pageSize,
        offset: this.pageIndex * this.pageSize,
        label: this.labelFilter || undefined,
      })
      .subscribe({
        next: (res) => {
          this.snapshots.set(res.snapshots);
          this.totalSnapshots.set(res.total);
        },
        error: (err) => console.error('Failed to load snapshots:', err),
      });
  }

  onPageChange(event: PaginatorState): void {
    this.pageSize = event.rows ?? this.pageSize;
    this.pageIndex = event.page ?? 0;
    this.loadSnapshots();
  }
}
