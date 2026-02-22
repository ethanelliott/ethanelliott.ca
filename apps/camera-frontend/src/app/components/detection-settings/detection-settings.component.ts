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
import {
  CameraApiService,
  DetectionSettings,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-detection-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ToggleSwitchModule, ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-container glass-card">
      <div class="settings-header">
        <i class="pi pi-sliders-h"></i>
        <span>Detection Labels</span>
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

    this.api.updateDetectionSettings(enabledLabels).subscribe({
      next: (settings) => this._applySettings(settings),
    });
  }
}
