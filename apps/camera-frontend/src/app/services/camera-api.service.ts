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
  }): Observable<DetectionEventsResponse> {
    let httpParams = new HttpParams();
    if (params?.limit) httpParams = httpParams.set('limit', params.limit);
    if (params?.offset) httpParams = httpParams.set('offset', params.offset);
    if (params?.label) httpParams = httpParams.set('label', params.label);
    if (params?.minConfidence)
      httpParams = httpParams.set('minConfidence', params.minConfidence);
    if (params?.since) httpParams = httpParams.set('since', params.since);

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
}
