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
import { COCO_LABELS } from '../../constants/labels';
import {
  CameraApiService,
  NotificationSettings,
  ThreatLevel,
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
      <div class="setting-row border-bottom superseded">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-percentage"></i>
            Min Confidence
          </span>
          <span class="setting-hint">
            Not used while scene analysis decides
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
      <div class="labels-section border-bottom superseded">
        <div class="labels-header">
          <span>Notify Labels</span>
          <span class="spacer"></span>
          <span class="enabled-count"> {{ notifyLabelCount() }} selected </span>
        </div>
        <span class="setting-hint label-hint">
          Not used while scene analysis decides — which labels get analysed is
          set under Scene Analysis.
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

      <!-- Scene-analysis rules -->
      <div class="rules-section border-bottom">
        <div class="rules-intro">
          <i class="pi pi-sparkles"></i>
          <div>
            <strong>Scene analysis decides</strong>
            <p>
              Alerts come from what the vision model saw, not from the raw
              detection &mdash; so &ldquo;person, 87%&rdquo; becomes
              &ldquo;someone at a car door after dark&rdquo;. Turning scene
              analysis off under Scene Analysis falls back to notifying on
              labels and confidence alone.
            </p>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">
              <i class="pi pi-shield"></i>
              Minimum threat
            </span>
            <span class="setting-hint">
              Notify when the scene is rated at least this severe
            </span>
          </div>
          <p-select
            [(ngModel)]="minThreat"
            [options]="threatOptions"
            optionLabel="label"
            optionValue="value"
            (ngModelChange)="onMinThreatChange()"
            [style]="{ width: '150px' }"
            [disabled]="loading()"
          />
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">
              <i class="pi pi-flag"></i>
              Follow the model's call
            </span>
            <span class="setting-hint">
              Also notify whenever the model itself flags the frame as worth
              interrupting you for
            </span>
          </div>
          <p-toggleswitch
            [(ngModel)]="followModelRecommendation"
            (ngModelChange)="onFollowRecommendationChange()"
            [disabled]="loading()"
          />
        </div>

        <div class="labels-section">
          <div class="labels-header">
            <span>Always notify on</span>
            <span class="spacer"></span>
            <span class="enabled-count">
              {{ triggerSet().size }} selected
            </span>
          </div>
          <span class="setting-hint label-hint">
            These conditions notify on their own, whatever the threat rating.
          </span>
          <div class="label-chips">
            @for (trigger of availableTriggers(); track trigger.value) {
            <button
              class="label-chip"
              [class.active]="triggerSet().has(trigger.value)"
              (click)="toggleTrigger(trigger.value)"
              [disabled]="loading()"
            >
              {{ trigger.label }}
            </button>
            }
          </div>
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

    .rules-section {
      display: flex;
      flex-direction: column;
    }

    .rules-section .setting-row,
    .rules-section .labels-section {
      border-bottom: none;
    }

    :host ::ng-deep .rules-note {
      margin: 0 16px 4px;
    }

    /* Settings the analysis path bypasses: kept reachable, visibly not in play */
    .superseded {
      opacity: 0.45;
    }

    .rules-intro {
      display: flex;
      gap: 10px;
      padding: 14px 16px 4px;

      > i {
        color: #a855f7;
        font-size: 16px;
        margin-top: 2px;
      }

      strong {
        font-size: 13px;
        font-weight: 600;
      }

      p {
        margin-top: 3px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--text-muted);
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

  /** Trigger vocabulary, fetched so it cannot drift from the backend enum. */
  readonly availableTriggers = signal<{ value: string; label: string }[]>([]);
  readonly triggerSet = signal<Set<string>>(new Set());

  enabledValue = false;
  serverUrl = '';
  topic = '';
  cooldownSeconds = 30;
  minConfidence = 0.7;
  attachSnapshot = true;
  minThreat: ThreatLevel = 'suspicious';
  followModelRecommendation = true;

  readonly commonLabels = [...COCO_LABELS];

  readonly threatOptions = [
    { label: 'Notable', value: 'notable' },
    { label: 'Suspicious', value: 'suspicious' },
    { label: 'Critical only', value: 'critical' },
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

    this.api.getAnalysisTaxonomy().subscribe({
      next: (taxonomy) => this.availableTriggers.set(taxonomy.triggers),
      error: () => this.availableTriggers.set([]),
    });
  }

  onMinThreatChange(): void {
    this._save({ minThreat: this.minThreat });
  }

  onFollowRecommendationChange(): void {
    this._save({ followModelRecommendation: this.followModelRecommendation });
  }

  toggleTrigger(trigger: string): void {
    const current = new Set(this.triggerSet());
    if (current.has(trigger)) {
      current.delete(trigger);
    } else {
      current.add(trigger);
    }
    this.triggerSet.set(current);
    this._save({ notifyTriggers: [...current] });
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
    this.minThreat = settings.minThreat;
    this.followModelRecommendation = settings.followModelRecommendation;
    this.triggerSet.set(new Set(settings.notifyTriggers));

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
