import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import {
  CameraApiService,
  RecordingSettings,
  RecordingStatus,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-recording-settings',
  standalone: true,
  imports: [CommonModule, DecimalPipe, FormsModule, ToggleSwitchModule, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-container glass-card">
      <div class="settings-header">
        <i class="pi pi-video"></i>
        <span>Recording Settings</span>
        <span class="spacer"></span>
        @if (saving()) {
        <i class="pi pi-spin pi-spinner saving-icon"></i>
        }
      </div>

      <!-- Enable -->
      <div class="setting-section">
        <div class="setting-row">
          <span class="setting-label">
            <i class="pi pi-circle-fill record-dot" [class.off]="!enabled"></i>
            Continuous Recording
          </span>
          <p-toggleswitch
            [(ngModel)]="enabled"
            (ngModelChange)="onEnabledChange()"
            [disabled]="loading()"
          />
        </div>
        <span class="setting-hint">
          Records the camera stream 24/7 so events can be played back.
          Toggling restarts the stream pipeline (a few seconds of downtime).
        </span>
      </div>

      <!-- Video Retention -->
      <div class="setting-section">
        <div class="setting-row">
          <span class="setting-label">
            <i class="pi pi-calendar"></i>
            Video Retention
          </span>
          <p-select
            [(ngModel)]="retentionDays"
            [options]="retentionOptions"
            optionLabel="label"
            optionValue="value"
            (ngModelChange)="onRetentionChange()"
            [disabled]="loading() || !enabled"
            [style]="{ width: '130px' }"
          />
        </div>
        <span class="setting-hint">
          Video older than {{ retentionDays }}
          {{ retentionDays === 1 ? 'day' : 'days' }} is deleted immediately
          and on every cleanup run.
        </span>
      </div>

      <!-- Storage projection -->
      @if (status(); as s) {
      <div class="setting-section usage-section">
        <div class="usage-row">
          <span class="usage-label">Current footage</span>
          <span class="usage-value">
            {{ s.totalSizeMB / 1024 | number : '1.1-1' }} GB
            ({{ s.segmentCount | number }} segments)
          </span>
        </div>
        @if (s.estimatedDailyGB !== null) {
        <div class="usage-row">
          <span class="usage-label">Measured write rate</span>
          <span class="usage-value">{{ s.estimatedDailyGB }} GB/day</span>
        </div>
        <div class="usage-row">
          <span class="usage-label">Projected at {{ retentionDays }}d</span>
          <span class="usage-value projected">
            ~{{ projectedGB() | number : '1.0-1' }} GB
          </span>
        </div>
        }
      </div>
      }
    </div>
  `,
  styles: `
    .settings-container {
      overflow: hidden;
    }

    .settings-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 500;

      i {
        color: var(--accent-blue);
        font-size: 20px;
      }
    }

    .spacer {
      flex: 1;
    }

    .saving-icon {
      font-size: 14px !important;
      color: var(--text-muted) !important;
    }

    .setting-section {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);

      &:last-child {
        border-bottom: none;
      }
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .setting-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;

      i {
        color: var(--accent-yellow);
        font-size: 16px;
      }
    }

    .record-dot {
      color: var(--accent-red) !important;
      font-size: 10px !important;

      &.off {
        color: var(--text-muted) !important;
      }
    }

    .setting-hint {
      display: block;
      margin-top: 6px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .usage-section {
      background: rgba(255, 255, 255, 0.02);
    }

    .usage-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 13px;
    }

    .usage-label {
      color: var(--text-muted);
    }

    .usage-value {
      color: var(--text-secondary);
      font-weight: 500;

      &.projected {
        color: var(--accent-blue);
      }
    }
  `,
})
export class RecordingSettingsComponent implements OnInit {
  private readonly api = inject(CameraApiService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly status = signal<RecordingStatus | null>(null);

  /** Bound to the toggle/select controls */
  enabled = true;
  retentionDays = 3;

  private readonly _retentionDaysSignal = signal(3);

  readonly projectedGB = computed(() => {
    const daily = this.status()?.estimatedDailyGB;
    return daily !== null && daily !== undefined
      ? daily * this._retentionDaysSignal()
      : 0;
  });

  readonly retentionOptions = [
    { label: '1 day', value: 1 },
    { label: '2 days', value: 2 },
    { label: '3 days', value: 3 },
    { label: '5 days', value: 5 },
    { label: '7 days', value: 7 },
    { label: '14 days', value: 14 },
  ];

  ngOnInit(): void {
    this.api.getRecordingSettings().subscribe({
      next: (settings) => this._applySettings(settings),
      error: () => this.loading.set(false),
    });
    this._loadStatus();
  }

  onEnabledChange(): void {
    this._save({ enabled: this.enabled });
  }

  onRetentionChange(): void {
    this._save({ retentionDays: this.retentionDays });
  }

  private _save(update: Partial<RecordingSettings>): void {
    this.saving.set(true);
    this.api.updateRecordingSettings(update).subscribe({
      next: (settings) => {
        this._applySettings(settings);
        this.saving.set(false);
        // Retention changes prune immediately — refresh the usage numbers
        this._loadStatus();
      },
      error: () => this.saving.set(false),
    });
  }

  private _applySettings(settings: RecordingSettings): void {
    this.enabled = settings.enabled;
    this.retentionDays = settings.retentionDays;
    this._retentionDaysSignal.set(settings.retentionDays);
    this.loading.set(false);
  }

  private _loadStatus(): void {
    this.api.getRecordingStatus().subscribe({
      next: (status) => this.status.set(status),
      error: () => this.status.set(null),
    });
  }
}
