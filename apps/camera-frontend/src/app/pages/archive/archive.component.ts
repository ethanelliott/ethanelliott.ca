import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
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
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatPaginatorModule,
    SnapshotGalleryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="archive-page">
      <div class="page-header">
        <h1 class="page-title">Snapshot Archive</h1>
        <span class="spacer"></span>
        <button mat-stroked-button (click)="loadSnapshots()">
          <mat-icon>refresh</mat-icon>
          Refresh
        </button>
      </div>

      <!-- Filters -->
      <div class="filters glass-card">
        <mat-form-field appearance="outline">
          <mat-label>Filter by Label</mat-label>
          <mat-select
            [(ngModel)]="labelFilter"
            (selectionChange)="loadSnapshots()"
          >
            <mat-option value="">All</mat-option>
            <mat-option value="person">Person</mat-option>
            <mat-option value="car">Car</mat-option>
            <mat-option value="cat">Cat</mat-option>
            <mat-option value="dog">Dog</mat-option>
          </mat-select>
        </mat-form-field>

        <span class="total-count">
          {{ totalSnapshots() }} snapshots total
        </span>
      </div>

      <app-snapshot-gallery [snapshots]="snapshots" />

      <mat-paginator
        [length]="totalSnapshots()"
        [pageSize]="pageSize"
        [pageSizeOptions]="[24, 48, 96]"
        (page)="onPageChange($event)"
        showFirstLastButtons
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
      align-items: center;
      gap: 16px;
      padding: 16px;
      margin-bottom: 20px;

      mat-form-field {
        width: 180px;
      }
    }

    .total-count {
      color: var(--text-muted);
      font-size: 13px;
    }

    mat-paginator {
      margin-top: 20px;
      background: transparent !important;
    }
  `,
})
export class ArchiveComponent implements OnInit {
  private readonly api = inject(CameraApiService);

  readonly snapshots = signal<SnapshotInfo[]>([]);
  readonly totalSnapshots = signal(0);

  labelFilter = '';
  pageSize = 48;
  pageIndex = 0;

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

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.loadSnapshots();
  }
}
