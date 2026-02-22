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
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import {
  CameraApiService,
  AnalysisSettings,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-analysis-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ToggleSwitchModule,
    ButtonDirective,
    SelectModule,
    InputTextModule,
    TextareaModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-container glass-card">
      <div class="settings-header">
        <i class="pi pi-sparkles"></i>
        <span>Scene Analysis (AI)</span>
        <span class="spacer"></span>
        <span class="status-badge" [class.active]="enabled()">
          {{ enabled() ? 'Enabled' : 'Disabled' }}
        </span>
      </div>

      <!-- Enable/Disable Toggle -->
      <div class="setting-row border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-power-off"></i>
            Enable Scene Analysis
          </span>
          <span class="setting-hint">
            Send detection snapshots to Ollama vision model for scene
            description
          </span>
        </div>
        <p-toggleswitch
          [(ngModel)]="enabledValue"
          (ngModelChange)="onEnabledChange()"
          [disabled]="loading()"
        />
      </div>

      <!-- Model -->
      <div class="setting-row border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-microchip-ai"></i>
            Model
          </span>
          <span class="setting-hint">Ollama vision model to use</span>
        </div>
        <input
          pInputText
          type="text"
          [(ngModel)]="model"
          (blur)="onModelChange()"
          class="setting-input"
          placeholder="qwen3-vl:4b"
          [disabled]="loading()"
        />
      </div>

      <!-- Prompt -->
      <div class="setting-row-vertical border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-comment"></i>
            Prompt
          </span>
          <span class="setting-hint">
            The prompt sent to the vision model along with the snapshot
          </span>
        </div>
        <textarea
          pTextarea
          [(ngModel)]="prompt"
          (blur)="onPromptChange()"
          rows="3"
          class="prompt-input"
          placeholder="Analyze this security camera frame..."
          [disabled]="loading()"
        ></textarea>
      </div>

      <!-- Cooldown -->
      <div class="setting-row border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-stopwatch"></i>
            Cooldown
          </span>
          <span class="setting-hint">
            Minimum time between analyses for the same label
          </span>
        </div>
        <p-select
          [(ngModel)]="cooldownSeconds"
          [options]="cooldownOptions"
          optionLabel="label"
          optionValue="value"
          (ngModelChange)="onCooldownChange()"
          [style]="{ width: '130px' }"
          [disabled]="loading()"
        />
      </div>

      <!-- Min Confidence -->
      <div class="setting-row border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-percentage"></i>
            Min Confidence
          </span>
          <span class="setting-hint">
            Only analyze when detection confidence is at least
            {{ minConfidencePct() }}%
          </span>
        </div>
        <p-select
          [(ngModel)]="minConfidence"
          [options]="confidenceOptions"
          optionLabel="label"
          optionValue="value"
          (ngModelChange)="onConfidenceChange()"
          [style]="{ width: '100px' }"
          [disabled]="loading()"
        />
      </div>

      <!-- Analyze Labels -->
      <div class="labels-section">
        <div class="labels-header">
          <span>Analyze Labels</span>
          <span class="spacer"></span>
          <span class="enabled-count">
            {{ analyzeLabelCount() }} selected
          </span>
        </div>
        <span class="setting-hint label-hint">
          Only analyze detections for these labels (empty = all detected labels)
        </span>
        <div class="label-chips">
          @for (label of commonLabels; track label) {
          <button
            class="label-chip"
            [class.active]="analyzeLabelSet().has(label)"
            (click)="toggleAnalyzeLabel(label)"
            [disabled]="loading()"
          >
            {{ label }}
          </button>
          }
        </div>
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
        color: #a855f7;
        font-size: 20px;
      }
    }

    .spacer {
      flex: 1;
    }

    .status-badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 3px 10px;
      border-radius: 12px;
      background: rgba(239, 68, 68, 0.15);
      color: var(--accent-red);

      &.active {
        background: rgba(34, 197, 94, 0.15);
        color: var(--accent-green);
      }
    }

    .border-bottom {
      border-bottom: 1px solid var(--border-color);
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px;
    }

    .setting-row-vertical {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px;
    }

    .setting-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .setting-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;

      i {
        color: var(--text-muted);
        font-size: 16px;
      }
    }

    .setting-hint {
      font-size: 12px;
      color: var(--text-muted);
    }

    .setting-input {
      width: 220px;
      font-size: 13px;
    }

    .prompt-input {
      width: 100%;
      font-size: 13px;
      resize: vertical;
    }

    .labels-section {
      padding: 12px 16px;
    }

    .labels-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .label-hint {
      display: block;
      margin-top: 4px;
    }

    .enabled-count {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 400;
    }

    .label-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }

    .label-chip {
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      text-transform: capitalize;
      border: 1px solid var(--border-color);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover:not(:disabled) {
        border-color: #a855f7;
        color: var(--text-primary);
      }

      &.active {
        background: rgba(168, 85, 247, 0.15);
        border-color: #a855f7;
        color: #a855f7;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  `,
})
export class AnalysisSettingsComponent implements OnInit {
  private readonly api = inject(CameraApiService);

  readonly loading = signal(false);
  readonly enabled = signal(false);
  readonly analyzeLabelSet = signal<Set<string>>(new Set());
  readonly analyzeLabelCount = signal(0);
  readonly minConfidencePct = signal(70);

  enabledValue = true;
  model = 'qwen3-vl:4b';
  prompt = '';
  cooldownSeconds = 30;
  minConfidence = 0.7;

  readonly commonLabels = [
    'person',
    'car',
    'truck',
    'bus',
    'motorcycle',
    'bicycle',
    'dog',
    'cat',
    'bird',
    'bear',
  ];

  readonly cooldownOptions = [
    { label: 'None', value: 0 },
    { label: '10 sec', value: 10 },
    { label: '30 sec', value: 30 },
    { label: '1 min', value: 60 },
    { label: '2 min', value: 120 },
    { label: '5 min', value: 300 },
    { label: '10 min', value: 600 },
  ];

  readonly confidenceOptions = [
    { label: '50%', value: 0.5 },
    { label: '60%', value: 0.6 },
    { label: '70%', value: 0.7 },
    { label: '80%', value: 0.8 },
    { label: '90%', value: 0.9 },
  ];

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getAnalysisSettings().subscribe({
      next: (settings) => this._applySettings(settings),
      error: () => this.loading.set(false),
    });
  }

  onEnabledChange(): void {
    this._save({ enabled: this.enabledValue });
  }

  onModelChange(): void {
    if (this.model) {
      this._save({ model: this.model });
    }
  }

  onPromptChange(): void {
    if (this.prompt) {
      this._save({ prompt: this.prompt });
    }
  }

  onCooldownChange(): void {
    this._save({ cooldownSeconds: this.cooldownSeconds });
  }

  onConfidenceChange(): void {
    this._save({ minConfidence: this.minConfidence });
  }

  toggleAnalyzeLabel(label: string): void {
    const current = new Set(this.analyzeLabelSet());
    if (current.has(label)) {
      current.delete(label);
    } else {
      current.add(label);
    }
    this.analyzeLabelSet.set(current);
    this.analyzeLabelCount.set(current.size);
    this._save({ analyzeLabels: [...current] });
  }

  private _applySettings(settings: AnalysisSettings): void {
    this.enabledValue = settings.enabled;
    this.enabled.set(settings.enabled);
    this.model = settings.model;
    this.prompt = settings.prompt;
    this.cooldownSeconds = settings.cooldownSeconds;
    this.minConfidence = settings.minConfidence;
    this.minConfidencePct.set(Math.round(settings.minConfidence * 100));

    const labelSet = new Set(settings.analyzeLabels);
    this.analyzeLabelSet.set(labelSet);
    this.analyzeLabelCount.set(labelSet.size);

    this.loading.set(false);
  }

  private _save(update: Partial<AnalysisSettings>): void {
    this.api.updateAnalysisSettings(update).subscribe({
      next: (settings) => this._applySettings(settings),
    });
  }
}
