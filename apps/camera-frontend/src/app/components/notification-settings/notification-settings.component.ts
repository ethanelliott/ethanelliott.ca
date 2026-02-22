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
import { SliderModule } from 'primeng/slider';
import { MessageModule } from 'primeng/message';
import {
  CameraApiService,
  NotificationSettings,
} from '../../services/camera-api.service';

@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ToggleSwitchModule,
    ButtonDirective,
    SelectModule,
    InputTextModule,
    SliderModule,
    MessageModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-container glass-card">
      <div class="settings-header">
        <i class="pi pi-bell"></i>
        <span>Push Notifications</span>
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
            Enable Notifications
          </span>
          <span class="setting-hint">
            Send push notifications to your phone when objects are detected
          </span>
        </div>
        <p-toggleswitch
          [(ngModel)]="enabledValue"
          (ngModelChange)="onEnabledChange()"
          [disabled]="loading()"
        />
      </div>

      <!-- Server URL -->
      <div class="setting-row border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-server"></i>
            Server URL
          </span>
          <span class="setting-hint">ntfy server address</span>
        </div>
        <input
          pInputText
          type="text"
          [(ngModel)]="serverUrl"
          (blur)="onServerChange()"
          class="setting-input"
          placeholder="https://ntfy.sh"
          [disabled]="loading()"
        />
      </div>

      <!-- Topic -->
      <div class="setting-row border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-hashtag"></i>
            Topic
          </span>
          <span class="setting-hint">
            Subscribe to this topic in the ntfy app
          </span>
        </div>
        <input
          pInputText
          type="text"
          [(ngModel)]="topic"
          (blur)="onTopicChange()"
          class="setting-input"
          placeholder="camera-detections"
          [disabled]="loading()"
        />
      </div>

      <!-- Cooldown -->
      <div class="setting-row border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-stopwatch"></i>
            Cooldown
          </span>
          <span class="setting-hint">
            Minimum time between notifications for the same label
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
            Only notify when confidence is at least
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

      <!-- Attach Snapshot -->
      <div class="setting-row border-bottom">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-image"></i>
            Attach Snapshot
          </span>
          <span class="setting-hint">
            Include the camera snapshot image in notifications
          </span>
        </div>
        <p-toggleswitch
          [(ngModel)]="attachSnapshot"
          (ngModelChange)="onAttachSnapshotChange()"
          [disabled]="loading()"
        />
      </div>

      <!-- Notify Labels -->
      <div class="labels-section border-bottom">
        <div class="labels-header">
          <span>Notify Labels</span>
          <span class="spacer"></span>
          <span class="enabled-count">
            {{ notifyLabelCount() }} selected
          </span>
        </div>
        <span class="setting-hint label-hint">
          Only send notifications for these labels (empty = all enabled
          detection labels)
        </span>
        <div class="label-chips">
          @for (label of commonLabels; track label) {
          <button
            class="label-chip"
            [class.active]="notifyLabelSet().has(label)"
            (click)="toggleNotifyLabel(label)"
            [disabled]="loading()"
          >
            {{ label }}
          </button>
          }
        </div>
      </div>

      <!-- Test Notification -->
      <div class="test-section">
        <button
          pButton
          icon="pi pi-send"
          label="Send Test Notification"
          [outlined]="true"
          (click)="sendTest()"
          [disabled]="loading() || testSending()"
          [loading]="testSending()"
          class="test-btn"
        ></button>
        @if (testResult()) {
        <p-message
          [severity]="testResult()!.success ? 'success' : 'error'"
          [text]="testResult()!.message"
          styleClass="test-message"
        />
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
        color: var(--accent-yellow);
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
        border-color: var(--accent-blue);
        color: var(--text-primary);
      }

      &.active {
        background: rgba(59, 130, 246, 0.15);
        border-color: var(--accent-blue);
        color: var(--accent-blue);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .test-section {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .test-btn {
      align-self: flex-start;
    }

    .test-message {
      width: 100%;
    }
  `,
})
export class NotificationSettingsComponent implements OnInit {
  private readonly api = inject(CameraApiService);

  readonly loading = signal(false);
  readonly enabled = signal(false);
  readonly testSending = signal(false);
  readonly testResult = signal<{ success: boolean; message: string } | null>(
    null
  );
  readonly notifyLabelSet = signal<Set<string>>(new Set());
  readonly notifyLabelCount = signal(0);
  readonly minConfidencePct = signal(70);

  enabledValue = false;
  serverUrl = '';
  topic = '';
  cooldownSeconds = 30;
  minConfidence = 0.7;
  attachSnapshot = true;

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
    this.api.getNotificationSettings().subscribe({
      next: (settings) => this._applySettings(settings),
      error: () => this.loading.set(false),
    });
  }

  onEnabledChange(): void {
    this._save({ enabled: this.enabledValue });
  }

  onServerChange(): void {
    if (this.serverUrl) {
      this._save({ serverUrl: this.serverUrl });
    }
  }

  onTopicChange(): void {
    if (this.topic) {
      this._save({ topic: this.topic });
    }
  }

  onCooldownChange(): void {
    this._save({ cooldownSeconds: this.cooldownSeconds });
  }

  onConfidenceChange(): void {
    this._save({ minConfidence: this.minConfidence });
  }

  onAttachSnapshotChange(): void {
    this._save({ attachSnapshot: this.attachSnapshot });
  }

  toggleNotifyLabel(label: string): void {
    const current = new Set(this.notifyLabelSet());
    if (current.has(label)) {
      current.delete(label);
    } else {
      current.add(label);
    }
    this.notifyLabelSet.set(current);
    this.notifyLabelCount.set(current.size);
    this._save({ notifyLabels: [...current] });
  }

  sendTest(): void {
    this.testSending.set(true);
    this.testResult.set(null);
    this.api.sendTestNotification().subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.testSending.set(false);
      },
      error: (err) => {
        this.testResult.set({
          success: false,
          message: `Request failed: ${err.message || 'Unknown error'}`,
        });
        this.testSending.set(false);
      },
    });
  }

  private _applySettings(settings: NotificationSettings): void {
    this.enabledValue = settings.enabled;
    this.enabled.set(settings.enabled);
    this.serverUrl = settings.serverUrl;
    this.topic = settings.topic;
    this.cooldownSeconds = settings.cooldownSeconds;
    this.minConfidence = settings.minConfidence;
    this.minConfidencePct.set(Math.round(settings.minConfidence * 100));
    this.attachSnapshot = settings.attachSnapshot;

    const labelSet = new Set(settings.notifyLabels);
    this.notifyLabelSet.set(labelSet);
    this.notifyLabelCount.set(labelSet.size);

    this.loading.set(false);
  }

  private _save(update: Partial<NotificationSettings>): void {
    this.api.updateNotificationSettings(update).subscribe({
      next: (settings) => this._applySettings(settings),
    });
  }
}
