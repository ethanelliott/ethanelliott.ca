import { inject } from '@ee/di';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import {
  NotificationSettingsEntity,
  NotificationSettings,
  UpdateNotificationSettings,
} from './notification.entity';

/**
 * NotificationService sends push notifications via ntfy when detection
 * events occur. It manages per-label cooldowns to prevent notification spam.
 */
export class NotificationService {
  private readonly _db = inject(Database);
  private readonly _settingsRepo = this._db.repositoryFor(
    NotificationSettingsEntity
  );

  /** In-memory cache of the current settings */
  private _settings: NotificationSettingsEntity | null = null;

  /** Per-label timestamp of the last notification sent */
  private readonly _lastNotified = new Map<string, number>();

  private get _dataDir(): string {
    return (
      process.env.DATA_DIR ||
      (process.env.NODE_ENV === 'production' ? '/app/data' : './data')
    );
  }

  private get _snapshotDir(): string {
    return join(this._dataDir, 'snapshots');
  }

  /**
   * Load settings from the database (or create defaults).
   * Called once during startup.
   */
  async initialize(): Promise<void> {
    try {
      let row = await this._settingsRepo.findOne({ where: {} });
      if (!row) {
        row = this._settingsRepo.create({
          enabled: false,
          serverUrl: process.env.NTFY_SERVER_URL || 'https://ntfy.sh',
          topic: process.env.NTFY_TOPIC || 'camera-detections',
          authToken: process.env.NTFY_AUTH_TOKEN || null,
          cooldownSeconds: 30,
          minConfidence: 0.7,
          notifyLabels: ['person', 'car', 'dog', 'cat'],
          attachSnapshot: true,
        });
        await this._settingsRepo.save(row);
        console.log('🔔 Initialized default notification settings');
      }
      this._settings = row;
      console.log(
        `🔔 Notifications ${row.enabled ? 'ENABLED' : 'disabled'} → ${row.serverUrl}/${row.topic}`
      );
    } catch (err) {
      console.error('Failed to load notification settings:', err);
    }
  }

  /**
   * Get current notification settings.
   */
  getSettings(): NotificationSettings {
    const s = this._settings;
    return {
      enabled: s?.enabled ?? false,
      serverUrl: s?.serverUrl ?? 'https://ntfy.sh',
      topic: s?.topic ?? 'camera-detections',
      authToken: s?.authToken ?? null,
      cooldownSeconds: s?.cooldownSeconds ?? 30,
      minConfidence: s?.minConfidence ?? 0.7,
      notifyLabels: s?.notifyLabels ?? [],
      attachSnapshot: s?.attachSnapshot ?? true,
    };
  }

  /**
   * Update notification settings.
   */
  async updateSettings(
    update: UpdateNotificationSettings
  ): Promise<NotificationSettings> {
    if (!this._settings) {
      await this.initialize();
    }

    const row = this._settings!;
    if (update.enabled !== undefined) row.enabled = update.enabled;
    if (update.serverUrl !== undefined) row.serverUrl = update.serverUrl;
    if (update.topic !== undefined) row.topic = update.topic;
    if (update.authToken !== undefined) row.authToken = update.authToken;
    if (update.cooldownSeconds !== undefined)
      row.cooldownSeconds = update.cooldownSeconds;
    if (update.minConfidence !== undefined)
      row.minConfidence = update.minConfidence;
    if (update.notifyLabels !== undefined)
      row.notifyLabels = update.notifyLabels;
    if (update.attachSnapshot !== undefined)
      row.attachSnapshot = update.attachSnapshot;

    await this._settingsRepo.save(row);
    this._settings = row;

    console.log(
      `🔔 Notification settings updated: ${row.enabled ? 'ENABLED' : 'disabled'} → ${row.serverUrl}/${row.topic}`
    );

    return this.getSettings();
  }

  /**
   * Send a test notification to verify the settings are correct.
   */
  async sendTestNotification(): Promise<{ success: boolean; message: string }> {
    if (!this._settings) {
      return { success: false, message: 'Notification settings not loaded' };
    }

    try {
      const url = `${this._settings.serverUrl}/${this._settings.topic}`;
      const headers: Record<string, string> = {
        Title: '🧪 Camera Test Notification',
        Tags: 'test_tube,camera',
        Priority: '3',
      };

      if (this._settings.authToken) {
        headers['Authorization'] = `Bearer ${this._settings.authToken}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: `Test notification from camera service at ${new Date().toLocaleString()}`,
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          success: false,
          message: `ntfy returned ${response.status}: ${body}`,
        };
      }

      return { success: true, message: 'Test notification sent successfully' };
    } catch (err) {
      return {
        success: false,
        message: `Failed to send: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Called by the detection service when a new object is detected.
   * Decides whether to send a notification based on settings and cooldowns.
   */
  async onDetection(event: {
    label: string;
    confidence: number;
    snapshotFilename: string | null;
  }): Promise<void> {
    if (!this._settings?.enabled) return;

    // Check minimum confidence
    if (event.confidence < this._settings.minConfidence) return;

    // Check if this label should trigger notifications
    if (
      this._settings.notifyLabels.length > 0 &&
      !this._settings.notifyLabels.includes(event.label)
    ) {
      return;
    }

    // Check cooldown for this label
    const now = Date.now();
    const lastTime = this._lastNotified.get(event.label) ?? 0;
    const cooldownMs = this._settings.cooldownSeconds * 1000;
    if (now - lastTime < cooldownMs) return;

    // Send the notification
    try {
      await this._sendDetectionNotification(event);
      this._lastNotified.set(event.label, now);
    } catch (err) {
      console.error('Failed to send detection notification:', err);
    }
  }

  /**
   * Send the actual ntfy notification for a detection event.
   */
  private async _sendDetectionNotification(event: {
    label: string;
    confidence: number;
    snapshotFilename: string | null;
  }): Promise<void> {
    const s = this._settings!;
    const url = `${s.serverUrl}/${s.topic}`;
    const confidencePct = Math.round(event.confidence * 100);
    const title = `🎯 ${event.label} detected (${confidencePct}%)`;
    const body = `Camera detected: ${event.label} with ${confidencePct}% confidence at ${new Date().toLocaleString()}`;

    const headers: Record<string, string> = {
      Title: title,
      Tags: this._labelToTag(event.label),
      Priority: this._labelToPriority(event.label),
    };

    if (s.authToken) {
      headers['Authorization'] = `Bearer ${s.authToken}`;
    }

    // If snapshot attachment is enabled and we have a file, send it as the body
    if (s.attachSnapshot && event.snapshotFilename) {
      const snapshotPath = join(this._snapshotDir, event.snapshotFilename);
      try {
        const imageData = readFileSync(snapshotPath);
        headers['Filename'] = event.snapshotFilename;
        headers['Content-Type'] = 'image/jpeg';
        // Put the title in a message header since the body is the image
        headers['Message'] = body;

        const response = await fetch(url, {
          method: 'PUT',
          headers,
          body: imageData,
        });

        if (!response.ok) {
          console.warn(
            `ntfy image upload returned ${response.status}, falling back to text`
          );
          // Fall back to text-only notification
          await this._sendTextNotification(url, headers, body);
        }
      } catch {
        // File read failed, fall back to text
        await this._sendTextNotification(url, headers, body);
      }
    } else {
      await this._sendTextNotification(url, headers, body);
    }

    console.log(`🔔 Notification sent: ${event.label} (${confidencePct}%)`);
  }

  /**
   * Send a plain text notification.
   */
  private async _sendTextNotification(
    url: string,
    headers: Record<string, string>,
    body: string
  ): Promise<void> {
    // Remove image-specific headers for text fallback
    delete headers['Filename'];
    headers['Content-Type'] = 'text/plain';
    delete headers['Message'];

    await fetch(url, {
      method: 'POST',
      headers,
      body,
    });
  }

  /**
   * Map a detection label to relevant ntfy tags (emoji shortcodes).
   */
  private _labelToTag(label: string): string {
    const tagMap: Record<string, string> = {
      person: 'bust_in_silhouette,warning',
      car: 'car,warning',
      truck: 'truck,warning',
      dog: 'dog',
      cat: 'cat',
      bird: 'bird',
      bicycle: 'bicycle',
      motorcycle: 'motorcycle',
      bus: 'bus',
      bear: 'bear,rotating_light',
    };
    return tagMap[label] ?? 'camera,eyes';
  }

  /**
   * Map a detection label to ntfy priority level (1-5).
   */
  private _labelToPriority(label: string): string {
    const priorityMap: Record<string, string> = {
      person: '4', // high
      bear: '5', // urgent
      car: '3', // default
      truck: '3',
    };
    return priorityMap[label] ?? '3';
  }
}
