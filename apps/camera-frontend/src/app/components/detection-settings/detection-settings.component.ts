import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ButtonDirective } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import {
  CameraApiService,
  DetectionSettings,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-detection-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ToggleSwitchModule, ButtonDirective, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-container glass-card">
      <div class="settings-header">
        <i class="pi pi-sliders-h"></i>
        <span>Detection Settings</span>
      </div>

      <!-- Retention Period -->
      <div class="retention-section">
        <div class="retention-row">
          <span class="retention-label">
            <i class="pi pi-calendar"></i>
            Data Retention
          </span>
          <p-select
            [(ngModel)]="retentionDays"
            [options]="retentionOptions"
            optionLabel="label"
            optionValue="value"
            (ngModelChange)="onRetentionChange()"
            [style]="{ width: '130px' }"
          />
        </div>
        <span class="retention-hint">
          Events and snapshots older than {{ retentionDays }} days are automatically deleted.
        </span>
      </div>

      <!-- Labels Header -->
      <div class="labels-header">
        <span>Enabled Labels</span>
        <span class="spacer"></span>
        <span class="enabled-count">
          {{ enabledCount() }}/{{ totalCount() }}
        </span>
        <button
          pButton
          [text]="true"
          icon="pi pi-check-circle"
          (click)="enableAll()"
          class="header-btn"
          [disabled]="loading()"
        ></button>
        <button
          pButton
          [text]="true"
          icon="pi pi-ban"
          (click)="disableAll()"
          class="header-btn"
          [disabled]="loading()"
        ></button>
      </div>

      <div class="label-list">
        @for (label of availableLabels(); track label) {
        <div class="label-row">
          <p-toggleswitch
            [(ngModel)]="labelStates[label]"
            (ngModelChange)="onToggle()"
          />
          <span class="label-name">{{ label }}</span>
        </div>
        }
      </div>
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

    .enabled-count {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 400;
    }

    .header-btn {
      font-size: 14px !important;
      padding: 4px 8px !important;
    }

    .retention-section {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .retention-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .retention-label {
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

    .retention-hint {
      display: block;
      margin-top: 6px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .labels-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-color);
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .label-list {
      padding: 8px 16px;
      max-height: 360px;
      overflow-y: auto;
    }

    .label-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-color);

      &:last-child {
        border-bottom: none;
      }
    }

    .label-name {
      font-size: 14px;
      text-transform: capitalize;
    }
  `,
})
export class DetectionSettingsComponent implements OnInit {
  private readonly api = inject(CameraApiService);

  readonly availableLabels = signal<string[]>([]);
  readonly loading = signal(false);

  /** Mutable label → enabled state map (bound to toggles) */
  labelStates: Record<string, boolean> = {};

  /** Debounce timer for sending updates */
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly enabledCount = signal(0);
  readonly totalCount = signal(0);

  /** Retention period in days (bound to select) */
  retentionDays = 7;

  readonly retentionOptions = [
    { label: '1 day', value: 1 },
    { label: '3 days', value: 3 },
    { label: '7 days', value: 7 },
    { label: '14 days', value: 14 },
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
  ];

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getDetectionSettings().subscribe({
      next: (settings) => this._applySettings(settings),
      error: () => this.loading.set(false),
    });
  }

  onToggle(): void {
    this._updateCounts();
    this._debouncedSave();
  }

  onRetentionChange(): void {
    this.api.updateDetectionSettings({ retentionDays: this.retentionDays }).subscribe({
      next: (settings) => this._applySettings(settings),
    });
  }

  enableAll(): void {
    for (const label of this.availableLabels()) {
      this.labelStates[label] = true;
    }
    this._updateCounts();
    this._debouncedSave();
  }

  disableAll(): void {
    for (const label of this.availableLabels()) {
      this.labelStates[label] = false;
    }
    this._updateCounts();
    this._debouncedSave();
  }

  private _applySettings(settings: DetectionSettings): void {
    this.availableLabels.set(settings.availableLabels);
    this.totalCount.set(settings.availableLabels.length);
    this.retentionDays = settings.retentionDays;

    const enabledSet = new Set(settings.enabledLabels);
    this.labelStates = {};
    for (const label of settings.availableLabels) {
      this.labelStates[label] = enabledSet.has(label);
    }

    this._updateCounts();
    this.loading.set(false);
  }

  private _updateCounts(): void {
    const count = Object.values(this.labelStates).filter(Boolean).length;
    this.enabledCount.set(count);
  }

  private _debouncedSave(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => this._save(), 500);
  }

  private _save(): void {
    const enabledLabels = Object.entries(this.labelStates)
      .filter(([, enabled]) => enabled)
      .map(([label]) => label);

    this.api.updateDetectionSettings({ enabledLabels }).subscribe({
      next: (settings) => this._applySettings(settings),
    });
  }
}
