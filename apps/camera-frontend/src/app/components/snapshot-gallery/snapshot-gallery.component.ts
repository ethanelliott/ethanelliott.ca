import {
  ChangeDetectionStrategy,
  Component,
  Input,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Dialog } from 'primeng/dialog';
import {
  SnapshotInfo,
  CameraApiService,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-snapshot-gallery',
  standalone: true,
  imports: [CommonModule, DatePipe, Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gallery-container">
      @if (snapshots().length === 0) {
      <div class="empty-state">
        <i class="pi pi-images empty-icon"></i>
        <p>No snapshots captured yet</p>
      </div>
      } @else {
      <div class="gallery-grid">
        @for (snapshot of snapshots(); track snapshot.filename) {
        <div class="snapshot-card glass-card" (click)="openSnapshot(snapshot)">
          <div class="snapshot-image-wrapper">
            <img
              [src]="getSnapshotUrl(snapshot.filename)"
              [alt]="snapshot.label"
              loading="lazy"
              class="snapshot-image"
            />
          </div>
          <div class="snapshot-info">
            <div class="snapshot-label">
              <span class="label-text">{{ snapshot.label }}</span>
              <span class="confidence">
                {{ (snapshot.confidence * 100).toFixed(0) }}%
              </span>
            </div>
            <div class="snapshot-time">
              {{ snapshot.createdAt | date : 'MMM d, HH:mm:ss' }}
            </div>
          </div>
        </div>
        }
      </div>
      }
    </div>

    <!-- Lightbox dialog -->
    <p-dialog
      [(visible)]="lightboxVisible"
      [modal]="true"
      [dismissableMask]="true"
      [closable]="true"
      [showHeader]="false"
      styleClass="lightbox-dialog"
      (onHide)="closeLightbox()"
    >
      @if (selectedSnapshot()) {
      <div class="lightbox-content">
        <img
          [src]="getSnapshotUrl(selectedSnapshot()!.filename)"
          [alt]="selectedSnapshot()!.label"
          class="lightbox-image"
        />
        <div class="lightbox-info">
          <span class="label-text">{{ selectedSnapshot()!.label }}</span>
          <span class="confidence">
            {{ (selectedSnapshot()!.confidence * 100).toFixed(0) }}%
          </span>
          <span class="spacer"></span>
          <span class="timestamp">
            {{ selectedSnapshot()!.createdAt | date : 'medium' }}
          </span>
        </div>
      </div>
      }
    </p-dialog>
  `,
  styles: `
    .gallery-container {
      width: 100%;
    }

    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 16px;
    }

    .snapshot-card {
      cursor: pointer;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
      }
    }

    .snapshot-image-wrapper {
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #000;
    }

    .snapshot-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .snapshot-info {
      padding: 10px 12px;
    }

    .snapshot-label {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .label-text {
      font-weight: 500;
      text-transform: capitalize;
    }

    .confidence {
      font-size: 11px;
      color: var(--accent-green);
      background: rgba(34, 197, 94, 0.1);
      padding: 1px 6px;
      border-radius: 8px;
    }

    .snapshot-time {
      font-size: 12px;
      color: var(--text-muted);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 64px 16px;
      color: var(--text-muted);
    }

    .empty-icon {
      font-size: 56px;
      opacity: 0.4;
    }

    // Lightbox
    :host ::ng-deep .lightbox-dialog {
      .p-dialog {
        background: transparent;
        box-shadow: none;
        border: none;
        max-width: 90vw;
      }
      .p-dialog-content {
        background: transparent;
        padding: 0;
      }
    }

    .lightbox-content {
      position: relative;
    }

    .lightbox-image {
      max-width: 100%;
      max-height: 80vh;
      border-radius: var(--radius-md);
    }

    .lightbox-info {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      color: white;
    }

    .spacer {
      flex: 1;
    }

    .timestamp {
      font-size: 12px;
      color: var(--text-muted);
    }
  `,
})
export class SnapshotGalleryComponent {
  @Input() snapshots = signal<SnapshotInfo[]>([]);

  readonly selectedSnapshot = signal<SnapshotInfo | null>(null);
  lightboxVisible = false;

  constructor(private readonly api: CameraApiService) {}

  getSnapshotUrl(filename: string): string {
    return this.api.getSnapshotUrl(filename);
  }

  openSnapshot(snapshot: SnapshotInfo): void {
    this.selectedSnapshot.set(snapshot);
    this.lightboxVisible = true;
  }

  closeLightbox(): void {
    this.selectedSnapshot.set(null);
    this.lightboxVisible = false;
  }
}
