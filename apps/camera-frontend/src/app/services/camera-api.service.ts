import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CameraInfo {
  ip: string;
  model: string;
  rtspUrl: string;
  onvifPort: number;
  status: 'online' | 'offline' | 'unknown';
}

export interface DetectionEvent {
  id: string;
  timestamp: string;
  label: string;
  confidence: number;
  snapshotFilename: string | null;
  bbox: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
  pinned: boolean;
  /** Present when the event was fetched with `includeAnalysis` */
  analysis?: SceneAnalysis | null;
}

/** Lightweight detection data emitted per frame for the live overlay. */
export interface FrameDetection {
  id: string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
}

export interface DetectionEventsResponse {
  events: DetectionEvent[];
  total: number;
}

export interface DetectionStats {
  totalEvents: number;
  todayEvents: number;
  topLabels: { label: string; count: number }[];
  averageConfidence: number;
}

export interface DetectionSettings {
  availableLabels: string[];
  enabledLabels: string[];
  retentionDays: number;
}

export interface SnapshotInfo {
  filename: string;
  label: string;
  confidence: number;
  size: number;
  createdAt: string;
}

export interface SnapshotsResponse {
  snapshots: SnapshotInfo[];
  total: number;
}

export interface StreamStatus {
  running: boolean;
  hlsFiles: string[];
}

export interface NotificationSettings {
  enabled: boolean;
  serverUrl: string;
  topic: string;
  authToken: string | null;
  cooldownSeconds: number;
  minConfidence: number;
  notifyLabels: string[];
  attachSnapshot: boolean;
  /** Route notifications through scene analysis instead of raw detections */
  useAnalysis: boolean;
  minThreat: ThreatLevel;
  notifyTriggers: string[];
  followModelRecommendation: boolean;
}

export interface NotificationTestResult {
  success: boolean;
  message: string;
}

export type SceneEntityType = 'person' | 'vehicle' | 'animal' | 'object';
export type AnomalyRating = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SceneEntity {
  type: SceneEntityType;
  description: string;
  location: string;
  activity: string;
  anomaly_score: number;
  anomaly_reason: string | null;
}

export type SceneActivity =
  | 'nothing_notable'
  | 'person_passing'
  | 'person_loitering'
  | 'person_approaching'
  | 'person_at_entrance'
  | 'person_with_package'
  | 'person_at_vehicle'
  | 'group_gathering'
  | 'vehicle_passing'
  | 'vehicle_arriving'
  | 'vehicle_departing'
  | 'vehicle_parked_occupied'
  | 'delivery'
  | 'animal_present'
  | 'view_obstructed'
  | 'other';

export type ThreatLevel = 'benign' | 'notable' | 'suspicious' | 'critical';

export type LightingCondition =
  | 'daylight'
  | 'overcast'
  | 'dusk'
  | 'night'
  | 'glare';

export type VisibilityLevel = 'clear' | 'partial' | 'poor';

export interface SceneAnalysis {
  id: string;
  timestamp: string;
  detectionEventId: string;
  label: string;
  model: string;
  description: string;
  overallScore: number | null;
  overallRating: AnomalyRating | null;
  entities: SceneEntity[] | null;
  durationMs: number;
  snapshotFilename: string | null;
  /** What the model judged to be happening; null on pre-taxonomy rows */
  activity: SceneActivity | null;
  threat: ThreatLevel | null;
  triggers: string[] | null;
  notifyRecommended: boolean | null;
  notifyReason: string | null;
  lighting: LightingCondition | null;
  visibility: VisibilityLevel | null;
  /** Whether a push notification was actually dispatched */
  notified: boolean;
}

/** The classification vocabulary, served by the backend so it cannot drift. */
export interface AnalysisTaxonomy {
  activities: { value: string; label: string }[];
  threatLevels: string[];
  triggers: { value: string; label: string }[];
}

export interface SceneAnalysesResponse {
  analyses: SceneAnalysis[];
  total: number;
}

export interface AnalysisSettings {
  enabled: boolean;
  model: string;
  prompt: string;
  cooldownSeconds: number;
  analyzeLabels: string[];
  minConfidence: number;
}

export interface CleanupStatus {
  retentionDays: number;
  maxSnapshots: number;
  diskThresholdPct: number;
  diskUsagePct: number | null;
  snapshotCount: number;
  snapshotSizeMB: number;
  dbSizeMB: number;
  detectionEventCount: number;
  analysisCount: number;
  recordingCount: number;
  recordingSizeMB: number;
  videoRetentionDays: number;
}

export interface RecordingSettings {
  enabled: boolean;
  retentionDays: number;
  segmentSeconds: number;
}

/**
 * A contiguous run of footage inside a DVR window. Recording gaps collapse
 * in the assembled playlist, so media time and wall-clock drift apart across
 * one; the runs let the scrubber map between them exactly.
 */
export interface DvrRun {
  start: string;
  end: string;
  mediaOffsetSec: number;
}

export interface DvrWindow {
  start: string;
  end: string;
  durationSec: number;
  segmentCount: number;
  availableStart: string | null;
  runs: DvrRun[];
}

export interface RecordingStatus {
  enabled: boolean;
  segmentCount: number;
  totalSizeMB: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  retentionDays: number;
  segmentSeconds: number;
  estimatedDailyGB: number | null;
}

@Injectable({ providedIn: 'root' })
export class CameraApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  // ── Camera ──

  getCameraInfo(): Observable<CameraInfo> {
    return this.http.get<CameraInfo>(`${this.baseUrl}/camera/info`);
  }

  rediscoverCamera(): Observable<{ rtspUrl: string }> {
    return this.http.post<{ rtspUrl: string }>(
      `${this.baseUrl}/camera/rediscover`,
      {}
    );
  }

  // ── Stream ──

  getStreamStatus(): Observable<StreamStatus> {
    return this.http.get<StreamStatus>(`${this.baseUrl}/stream/status`);
  }

  getHlsUrl(): string {
    return `${this.baseUrl}/stream/hls/stream.m3u8`;
  }

  restartStream(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.baseUrl}/stream/restart`,
      {}
    );
  }

  // ── Detections ──

  getDetections(params?: {
    limit?: number;
    offset?: number;
    label?: string;
    minConfidence?: number;
    since?: string;
    until?: string;
    threat?: ThreatLevel;
    pinnedOnly?: boolean;
    includeAnalysis?: boolean;
  }): Observable<DetectionEventsResponse> {
    let httpParams = new HttpParams();
    if (params?.limit) httpParams = httpParams.set('limit', params.limit);
    if (params?.offset) httpParams = httpParams.set('offset', params.offset);
    if (params?.label) httpParams = httpParams.set('label', params.label);
    if (params?.minConfidence)
      httpParams = httpParams.set('minConfidence', params.minConfidence);
    if (params?.since) httpParams = httpParams.set('since', params.since);
    if (params?.until) httpParams = httpParams.set('until', params.until);
    if (params?.threat) httpParams = httpParams.set('threat', params.threat);
    if (params?.pinnedOnly) httpParams = httpParams.set('pinnedOnly', true);
    if (params?.includeAnalysis)
      httpParams = httpParams.set('includeAnalysis', true);

    return this.http.get<DetectionEventsResponse>(
      `${this.baseUrl}/detections`,
      { params: httpParams }
    );
  }

  getDetectionStats(): Observable<DetectionStats> {
    return this.http.get<DetectionStats>(`${this.baseUrl}/detections/stats`);
  }

  togglePinEvent(id: string): Observable<DetectionEvent> {
    return this.http.patch<DetectionEvent>(
      `${this.baseUrl}/detections/${id}/pin`,
      {}
    );
  }

  getDetectionSettings(): Observable<DetectionSettings> {
    return this.http.get<DetectionSettings>(
      `${this.baseUrl}/detections/settings`
    );
  }

  updateDetectionSettings(update: {
    enabledLabels?: string[];
    retentionDays?: number;
  }): Observable<DetectionSettings> {
    return this.http.put<DetectionSettings>(
      `${this.baseUrl}/detections/settings`,
      update
    );
  }

  // ── Snapshots ──

  getSnapshots(params?: {
    limit?: number;
    offset?: number;
    label?: string;
  }): Observable<SnapshotsResponse> {
    let httpParams = new HttpParams();
    if (params?.limit) httpParams = httpParams.set('limit', params.limit);
    if (params?.offset) httpParams = httpParams.set('offset', params.offset);
    if (params?.label) httpParams = httpParams.set('label', params.label);

    return this.http.get<SnapshotsResponse>(`${this.baseUrl}/snapshots`, {
      params: httpParams,
    });
  }

  getSnapshotUrl(filename: string): string {
    return `${this.baseUrl}/snapshots/${filename}`;
  }

  deleteSnapshot(filename: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/snapshots/${filename}`
    );
  }

  // ── Notifications ──

  getNotificationSettings(): Observable<NotificationSettings> {
    return this.http.get<NotificationSettings>(`${this.baseUrl}/notifications`);
  }

  updateNotificationSettings(
    update: Partial<NotificationSettings>
  ): Observable<NotificationSettings> {
    return this.http.put<NotificationSettings>(
      `${this.baseUrl}/notifications`,
      update
    );
  }

  sendTestNotification(): Observable<NotificationTestResult> {
    return this.http.post<NotificationTestResult>(
      `${this.baseUrl}/notifications/test`,
      {}
    );
  }

  // ── Scene Analysis ──

  getAnalyses(params?: {
    limit?: number;
    offset?: number;
    detectionEventId?: string;
    label?: string;
  }): Observable<SceneAnalysesResponse> {
    let httpParams = new HttpParams();
    if (params?.limit) httpParams = httpParams.set('limit', params.limit);
    if (params?.offset) httpParams = httpParams.set('offset', params.offset);
    if (params?.detectionEventId)
      httpParams = httpParams.set('detectionEventId', params.detectionEventId);
    if (params?.label) httpParams = httpParams.set('label', params.label);

    return this.http.get<SceneAnalysesResponse>(`${this.baseUrl}/analysis`, {
      params: httpParams,
    });
  }

  getAnalysisByDetection(detectionEventId: string): Observable<SceneAnalysis> {
    return this.http.get<SceneAnalysis>(
      `${this.baseUrl}/analysis/by-detection/${detectionEventId}`
    );
  }

  getAnalysisTaxonomy(): Observable<AnalysisTaxonomy> {
    return this.http.get<AnalysisTaxonomy>(`${this.baseUrl}/analysis/taxonomy`);
  }

  getAnalysisSettings(): Observable<AnalysisSettings> {
    return this.http.get<AnalysisSettings>(`${this.baseUrl}/analysis/settings`);
  }

  updateAnalysisSettings(
    update: Partial<AnalysisSettings>
  ): Observable<AnalysisSettings> {
    return this.http.put<AnalysisSettings>(
      `${this.baseUrl}/analysis/settings`,
      update
    );
  }

  // ── Recordings ──

  getRecordingStatus(): Observable<RecordingStatus> {
    return this.http.get<RecordingStatus>(`${this.baseUrl}/recordings/status`);
  }

  getRecordingSettings(): Observable<RecordingSettings> {
    return this.http.get<RecordingSettings>(
      `${this.baseUrl}/recordings/settings`
    );
  }

  updateRecordingSettings(
    update: Partial<RecordingSettings>
  ): Observable<RecordingSettings> {
    return this.http.put<RecordingSettings>(
      `${this.baseUrl}/recordings/settings`,
      update
    );
  }

  // ── DVR playback ──

  /** Bounds and gap layout of the scrub-back window. */
  getDvrWindow(minutes: number): Observable<DvrWindow> {
    return this.http.get<DvrWindow>(`${this.baseUrl}/recordings/dvr/window`, {
      params: new HttpParams().set('minutes', minutes),
    });
  }

  /** HLS playlist assembled from the rolling recording segments. */
  getDvrPlaylistUrl(minutes: number): string {
    return `${this.baseUrl}/recordings/dvr.m3u8?minutes=${minutes}`;
  }

  getClipUrl(start: Date, durationSec: number): string {
    return `${this.baseUrl}/recordings/clip?start=${encodeURIComponent(
      start.toISOString()
    )}&duration=${durationSec}`;
  }

  // ── Cleanup / Storage ──

  getCleanupStatus(): Observable<CleanupStatus> {
    return this.http.get<CleanupStatus>(`${this.baseUrl}/cleanup/status`);
  }

  triggerCleanup(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.baseUrl}/cleanup/trigger`,
      {}
    );
  }
}
