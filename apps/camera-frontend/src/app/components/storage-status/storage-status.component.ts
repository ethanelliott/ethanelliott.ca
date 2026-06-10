import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonDirective } from 'primeng/button';
import { ProgressBar } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import {
  CameraApiService,
  CleanupStatus,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-storage-status',
  standalone: true,
  imports: [CommonModule, ButtonDirective, ProgressBar, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="storage-container glass-card">
      <div class="storage-header">
        <div class="header-left">
          <i class="pi pi-database"></i>
          <span>Storage</span>
        </div>
        <button
          pButton
          [text]="true"
          icon="pi pi-refresh"
          (click)="refresh()"
          [loading]="refreshing()"
          class="refresh-btn"
          pTooltip="Refresh stats"
        ></button>
      </div>

      @if (status()) {
      <!-- Disk Usage -->
      @if (status()!.diskUsagePct !== null) {
      <div class="section">
        <div class="section-label">
          <i class="pi pi-server"></i>
          <span>Volume Usage</span>
          <span class="section-value" [class]="diskSeverity()">
            {{ status()!.diskUsagePct! | number : '1.1-1' }}%
          </span>
        </div>
        <p-progressBar
          [value]="status()!.diskUsagePct!"
          [showValue]="false"
          [style]="{ height: '8px' }"
          [styleClass]="'disk-bar disk-bar-' + diskSeverity()"
        />
        <span class="section-hint">
          Emergency cleanup triggers at {{ status()!.diskThresholdPct }}%
        </span>
      </div>
      }

      <!-- Breakdown -->
      <div class="section">
        <div class="section-label">
          <i class="pi pi-chart-pie"></i>
          <span>Breakdown</span>
        </div>

        <div class="breakdown-grid">
          <div class="breakdown-item">
            <div class="breakdown-value">
              {{ status()!.snapshotCount | number }}
            </div>
            <div class="breakdown-label">Snapshots</div>
            <div class="breakdown-sub">{{ status()!.snapshotSizeMB }} MB</div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-value">
              {{ status()!.detectionEventCount | number }}
            </div>
            <div class="breakdown-label">Events</div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-value">
              {{ status()!.analysisCount | number }}
            </div>
            <div class="breakdown-label">Analyses</div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-value">{{ status()!.dbSizeMB }} MB</div>
            <div class="breakdown-label">Database</div>
          </div>
          <div class="breakdown-item">
            <div class="breakdown-value">
              {{ status()!.recordingSizeMB / 1024 | number : '1.1-1' }} GB
            </div>
            <div class="breakdown-label">Recordings</div>
            <div class="breakdown-sub">
              {{ status()!.recordingCount | number }} segments
            </div>
          </div>
        </div>
      </div>

      <!-- Limits -->
      <div class="section limits-section">
        <div class="limit-row">
          <span class="limit-label">Retention</span>
          <span class="limit-value">{{ status()!.retentionDays }} days</span>
        </div>
        <div class="limit-row">
          <span class="limit-label">Video Retention</span>
          <span class="limit-value">
            {{ status()!.videoRetentionDays }} days
          </span>
        </div>
        <div class="limit-row">
          <span class="limit-label">Snapshot Cap</span>
          <span class="limit-value">
            {{ status()!.snapshotCount | number }} /
            {{ status()!.maxSnapshots | number }}
          </span>
        </div>
      </div>

      <!-- Run Cleanup Button -->
      <div class="action-section">
        <button
          pButton
          severity="warn"
          [outlined]="true"
          icon="pi pi-trash"
          label="Run Cleanup Now"
          (click)="triggerCleanup()"
          [loading]="cleaning()"
          [style]="{ width: '100%' }"
        ></button>
      </div>
      } @else {
      <div class="loading-placeholder">
        <i class="pi pi-spin pi-spinner"></i>
        <span>Loading storage info…</span>
      </div>
      }
    </div>
  `,
  styles: `
    .storage-container {
      overflow: hidden;
    }

    .storage-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 500;

      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      i {
        color: var(--accent-blue);
        font-size: 20px;
      }

      .refresh-btn {
        font-size: 14px !important;
        padding: 4px 8px !important;
      }
    }

    .section {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 8px;

      i {
        font-size: 14px;
        color: var(--text-muted);
      }
    }

    .section-value {
      margin-left: auto;
      font-weight: 600;
      font-size: 14px;

      &.ok {
        color: var(--accent-green);
      }

      &.warn {
        color: var(--accent-yellow);
      }

      &.critical {
        color: var(--accent-red);
      }
    }

    .section-hint {
      display: block;
      margin-top: 6px;
      font-size: 11px;
      color: var(--text-muted);
    }

    :host ::ng-deep .disk-bar .p-progressbar-value {
      border-radius: 4px;
      transition: width 0.4s ease;
    }

    :host ::ng-deep .disk-bar-ok .p-progressbar-value {
      background: var(--accent-green) !important;
    }

    :host ::ng-deep .disk-bar-warn .p-progressbar-value {
      background: var(--accent-yellow) !important;
    }

    :host ::ng-deep .disk-bar-critical .p-progressbar-value {
      background: var(--accent-red) !important;
    }

    .breakdown-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
      gap: 8px;
    }

    .breakdown-item {
      text-align: center;
      padding: 8px 4px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--radius-sm);
    }

    .breakdown-value {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .breakdown-label {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .breakdown-sub {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 1px;
    }

    .limits-section {
      padding: 10px 16px;
    }

    .limit-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 13px;

      &:not(:last-child) {
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 6px;
        margin-bottom: 4px;
      }
    }

    .limit-label {
      color: var(--text-muted);
    }

    .limit-value {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .action-section {
      padding: 12px 16px;
    }

    .loading-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 32px 16px;
      color: var(--text-muted);
      font-size: 13px;

      i {
        font-size: 18px;
      }
    }
  `,
})
export class StorageStatusComponent implements OnInit, OnDestroy {
  private readonly api = inject(CameraApiService);

  readonly status = signal<CleanupStatus | null>(null);
  readonly refreshing = signal(false);
  readonly cleaning = signal(false);

  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly diskSeverity = computed(() => {
    const pct = this.status()?.diskUsagePct;
    if (pct === null || pct === undefined) return 'ok';
    const threshold = this.status()?.diskThresholdPct ?? 85;
    if (pct >= threshold) return 'critical';
    if (pct >= threshold * 0.8) return 'warn';
    return 'ok';
  });

  ngOnInit(): void {
    this._load();
    // Auto-refresh every 60s
    this._pollTimer = setInterval(() => this._load(), 60_000);
  }

  ngOnDestroy(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
    }
  }

  refresh(): void {
    this.refreshing.set(true);
    this._load();
  }

  triggerCleanup(): void {
    this.cleaning.set(true);
    this.api.triggerCleanup().subscribe({
      next: () => {
        this.cleaning.set(false);
        // Refresh status after cleanup completes
        this._load();
      },
      error: () => {
        this.cleaning.set(false);
      },
    });
  }

  private _load(): void {
    this.api.getCleanupStatus().subscribe({
      next: (status) => {
        this.status.set(status);
        this.refreshing.set(false);
      },
      error: () => {
        this.refreshing.set(false);
      },
    });
  }
}
