import { inject } from '@ee/di';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import {
  NotificationSettingsEntity,
  NotificationSettings,
  UpdateNotificationSettings,
} from './notification.entity';
import { ACTIVITY_LABELS, THREAT_ORDER, TRIGGER_LABELS } from '../analysis/taxonomy';
import type {
  NotifyTrigger,
  SceneActivity,
  ThreatLevel,
} from '../analysis/taxonomy';

/**
 * ntfy's binary upload puts title and message in HTTP headers, which cannot
 * carry non-ASCII. Strip rather than let the request fail outright.
 */
function toAscii(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[^\x20-\x7E]/g, '').trim() || 'Camera event';
}

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

  /** Per-reason timestamp of the last notification sent */
  private readonly _lastNotified = new Map<string, number>();

  /**
   * Whether scene analysis is running and will therefore make the call.
   * Pushed in by AnalysisService rather than read from it, because the
   * dependency already runs the other way.
   */
  private _analysisAvailable = false;

  /** Told by AnalysisService whenever it starts up or its settings change. */
  setAnalysisAvailable(available: boolean): void {
    this._analysisAvailable = available;
  }

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
          minThreat: 'suspicious',
          notifyTriggers: [],
          followModelRecommendation: true,
        });
        await this._settingsRepo.save(row);
        console.log('🔔 Initialized default notification settings');
      } else {
        // Sync env-var overrides into the persisted row so that
        // changing the deployment env vars takes effect on restart.
        let dirty = false;
        const envUrl = process.env.NTFY_SERVER_URL;
        const envTopic = process.env.NTFY_TOPIC;
        const envToken = process.env.NTFY_AUTH_TOKEN;
        if (envUrl && row.serverUrl !== envUrl) {
          row.serverUrl = envUrl;
          dirty = true;
        }
        if (envTopic && row.topic !== envTopic) {
          row.topic = envTopic;
          dirty = true;
        }
        if (envToken !== undefined && row.authToken !== (envToken || null)) {
          row.authToken = envToken || null;
          dirty = true;
        }
        if (dirty) {
          await this._settingsRepo.save(row);
          console.log('🔔 Synced notification settings from env vars');
        }
      }
      this._settings = row;
      console.log(
        `🔔 Notifications ${row.enabled ? 'ENABLED' : 'disabled'} → ${
          row.serverUrl
        }/${row.topic}`
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
      minThreat: s?.minThreat ?? 'suspicious',
      notifyTriggers: s?.notifyTriggers ?? [],
      followModelRecommendation: s?.followModelRecommendation ?? true,
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
    if (update.minThreat !== undefined) row.minThreat = update.minThreat;
    if (update.notifyTriggers !== undefined)
      row.notifyTriggers = update.notifyTriggers;
    if (update.followModelRecommendation !== undefined)
      row.followModelRecommendation = update.followModelRecommendation;

    await this._settingsRepo.save(row);
    this._settings = row;

    console.log(
      `🔔 Notification settings updated: ${
        row.enabled ? 'ENABLED' : 'disabled'
      } → ${row.serverUrl}/${row.topic}`
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
      const url = `${this._settings.serverUrl}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this._settings.authToken) {
        headers['Authorization'] = `Bearer ${this._settings.authToken}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic: this._settings.topic,
          title: 'Camera Test Notification',
          message: `Test notification from camera service at ${new Date().toLocaleString()}`,
          tags: ['test_tube', 'camera'],
          priority: 3,
        }),
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
        message: `Failed to send: ${
          err instanceof Error ? err.message : String(err)
        }`,
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

    // Scene analysis decides whenever it is running: a raw detection can only
    // say "person, 87%", which is not enough to judge. This path is the
    // fallback for when analysis is switched off entirely.
    if (this._analysisAvailable) return;

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
   * Decide whether a completed scene analysis is worth a push notification.
   *
   * This is the point where the vision model earns its keep. The detector can
   * only say "person, 87%"; the analysis can say the person is at a car door
   * after dark, which is the difference between a useful alert and the kind of
   * noise that gets notifications muted.
   *
   * Returns whether a notification was actually sent.
   */
  async onAnalysis(analysis: {
    label: string;
    snapshotFilename: string | null;
    /** When the subject was seen, so the alert can link back to it */
    at: Date;
    summary: string;
    activity: SceneActivity | null;
    threat: ThreatLevel | null;
    triggers: NotifyTrigger[];
    notifyRecommended: boolean;
    notifyReason: string | null;
  }): Promise<boolean> {
    const settings = this._settings;
    if (!settings?.enabled) return false;

    const threat = analysis.threat ?? 'benign';
    const matchedTriggers = analysis.triggers.filter((trigger) =>
      settings.notifyTriggers.includes(trigger)
    );

    // Any one of the three routes is enough: severity, a configured
    // condition, or the model asking for attention outright.
    const meetsThreat =
      THREAT_ORDER[threat] >= THREAT_ORDER[settings.minThreat];
    const meetsTrigger = matchedTriggers.length > 0;
    const meetsRecommendation =
      settings.followModelRecommendation && analysis.notifyRecommended;

    if (!meetsThreat && !meetsTrigger && !meetsRecommendation) return false;

    // Cooldown is keyed on the reason rather than the label, so a car arriving
    // cannot suppress the alert for someone at a car door a moment later.
    const reasonKey = meetsTrigger
      ? `trigger:${matchedTriggers[0]}`
      : `threat:${threat}`;
    const now = Date.now();
    const lastTime = this._lastNotified.get(reasonKey) ?? 0;
    if (now - lastTime < settings.cooldownSeconds * 1000) return false;

    try {
      await this._sendAnalysisNotification(analysis, threat, matchedTriggers);
      this._lastNotified.set(reasonKey, now);
      return true;
    } catch (err) {
      console.error('Failed to send analysis notification:', err);
      return false;
    }
  }

  /**
   * Send an ntfy notification describing what the model saw. Priority follows
   * the threat level so a critical alert can break through a phone's quiet
   * hours while a merely notable one cannot.
   */
  private async _sendAnalysisNotification(
    analysis: {
      label: string;
      snapshotFilename: string | null;
      at: Date;
      summary: string;
      activity: SceneActivity | null;
      notifyReason: string | null;
    },
    threat: ThreatLevel,
    matchedTriggers: NotifyTrigger[]
  ): Promise<void> {
    const s = this._settings!;
    const activityLabel = analysis.activity
      ? ACTIVITY_LABELS[analysis.activity]
      : analysis.label;

    const title =
      threat === 'critical' ? `⚠️ ${activityLabel}` : activityLabel;

    const reasons = matchedTriggers.map((t) => TRIGGER_LABELS[t]);
    const message = [
      analysis.notifyReason ?? analysis.summary,
      reasons.length ? `\n\n${reasons.join(' · ')}` : '',
    ].join('');

    const priority = { benign: 2, notable: 3, suspicious: 4, critical: 5 }[
      threat
    ];
    const tags = [
      ...this._labelToTags(analysis.label),
      ...(threat === 'critical' ? ['rotating_light'] : []),
    ];

    await this._dispatch({
      title,
      message,
      tags,
      priority,
      snapshotFilename: s.attachSnapshot ? analysis.snapshotFilename : null,
      click: this._deepLink(analysis.at),
    });

    console.log(
      `🔔 Notification sent: ${activityLabel} [${threat}]${
        reasons.length ? ` (${reasons.join(', ')})` : ''
      }`
    );
  }

  /**
   * Publish to ntfy, attaching the snapshot when there is one.
   *
   * The binary upload carries its metadata in headers, which must stay
   * ASCII — so it is only used when an image is actually attached, and any
   * failure falls back to the JSON API that handles UTF-8 natively.
   */
  private async _dispatch(payload: {
    title: string;
    message: string;
    tags: string[];
    priority: number;
    snapshotFilename: string | null;
    /** Deep link back to this moment in the camera timeline */
    click?: string | null;
  }): Promise<void> {
    const s = this._settings!;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (s.authToken) headers['Authorization'] = `Bearer ${s.authToken}`;

    if (payload.snapshotFilename) {
      try {
        const imageData = readFileSync(
          join(this._snapshotDir, payload.snapshotFilename)
        );
        const putHeaders: Record<string, string> = {
          Title: toAscii(payload.title),
          Message: toAscii(payload.message),
          Tags: payload.tags.join(','),
          Priority: String(payload.priority),
          Filename: payload.snapshotFilename,
          'Content-Type': 'image/jpeg',
        };
        if (payload.click) putHeaders['Click'] = payload.click;
        if (s.authToken) putHeaders['Authorization'] = `Bearer ${s.authToken}`;

        const response = await fetch(`${s.serverUrl}/${s.topic}`, {
          method: 'PUT',
          headers: putHeaders,
          body: imageData,
        });
        if (response.ok) return;

        console.warn(
          `ntfy image upload returned ${response.status}, falling back to JSON`
        );
      } catch {
        // Fall through to the JSON API below.
      }
    }

    await this._sendJsonNotification(
      s.serverUrl,
      headers,
      s.topic,
      payload.title,
      payload.message,
      payload.tags,
      payload.priority,
      payload.click ?? null
    );
  }

  /**
   * Link back to the moment the alert is about.
   *
   * The recording already holds the footage, so an alert can point at the
   * instant rather than just describing it — tapping the notification opens
   * the timeline paused there instead of at the live edge, where whatever
   * happened is by then long gone.
   */
  private _deepLink(at: Date): string | null {
    const base = process.env.CAMERA_APP_URL;
    if (!base) return null;
    return `${base.replace(/\/+$/, '')}/dashboard?at=${encodeURIComponent(
      at.toISOString()
    )}`;
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
    const url = `${s.serverUrl}`;
    const confidencePct = Math.round(event.confidence * 100);
    const title = `${event.label} detected (${confidencePct}%)`;
    const message = `Camera detected: ${
      event.label
    } with ${confidencePct}% confidence at ${new Date().toLocaleString()}`;
    const tags = this._labelToTags(event.label);
    const priority = 2; // Normal priority

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (s.authToken) {
      headers['Authorization'] = `Bearer ${s.authToken}`;
    }

    // If snapshot attachment is enabled and we have a file, upload it via PUT
    // (binary upload requires header-based metadata — keep ASCII only)
    if (s.attachSnapshot && event.snapshotFilename) {
      const snapshotPath = join(this._snapshotDir, event.snapshotFilename);
      try {
        const imageData = readFileSync(snapshotPath);
        const putHeaders: Record<string, string> = {
          Title: title,
          Message: message,
          Tags: tags.join(','),
          Priority: String(priority),
          Filename: event.snapshotFilename,
          'Content-Type': 'image/jpeg',
        };
        if (s.authToken) {
          putHeaders['Authorization'] = `Bearer ${s.authToken}`;
        }

        const response = await fetch(`${s.serverUrl}/${s.topic}`, {
          method: 'PUT',
          headers: putHeaders,
          body: imageData,
        });

        if (!response.ok) {
          console.warn(
            `ntfy image upload returned ${response.status}, falling back to JSON`
          );
          await this._sendJsonNotification(
            url,
            headers,
            s.topic,
            title,
            message,
            tags,
            priority
          );
        }
      } catch {
        // File read failed, fall back to JSON
        await this._sendJsonNotification(
          url,
          headers,
          s.topic,
          title,
          message,
          tags,
          priority
        );
      }
    } else {
      await this._sendJsonNotification(
        url,
        headers,
        s.topic,
        title,
        message,
        tags,
        priority
      );
    }

    console.log(`🔔 Notification sent: ${event.label} (${confidencePct}%)`);
  }

  /**
   * Send a notification using ntfy's JSON API (supports UTF-8 natively).
   */
  private async _sendJsonNotification(
    url: string,
    headers: Record<string, string>,
    topic: string,
    title: string,
    message: string,
    tags: string[],
    priority: number,
    click: string | null = null
  ): Promise<void> {
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic,
        title,
        message,
        tags,
        priority,
        ...(click ? { click } : {}),
      }),
    });
  }

  /**
   * Map a detection label to relevant ntfy tags (emoji shortcodes).
   */
  private _labelToTags(label: string): string[] {
    const tagMap: Record<string, string[]> = {
      person: ['bust_in_silhouette', 'warning'],
      car: ['car', 'warning'],
      truck: ['truck', 'warning'],
      dog: ['dog'],
      cat: ['cat'],
      bird: ['bird'],
      bicycle: ['bicycle'],
      motorcycle: ['motorcycle'],
      bus: ['bus'],
      bear: ['bear', 'rotating_light'],
    };
    return tagMap[label] ?? ['camera', 'eyes'];
  }
}
