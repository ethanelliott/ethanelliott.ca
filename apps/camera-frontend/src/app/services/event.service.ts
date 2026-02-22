import { Injectable, OnDestroy, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import {
  DetectionEvent,
  FrameDetection,
  SceneAnalysis,
} from './camera-api.service';

/**
 * EventService connects to the backend via Socket.io
 * to receive real-time detection events.
 */
@Injectable({ providedIn: 'root' })
export class EventService implements OnDestroy {
  private socket: Socket | null = null;

  /** Signal holding the latest detection events (most recent first) */
  readonly recentEvents = signal<DetectionEvent[]>([]);

  /** Signal holding all detections from the latest frame (for live overlay) */
  readonly currentFrameDetections = signal<FrameDetection[]>([]);

  /** Signal holding recent scene analyses (most recent first) */
  readonly recentAnalyses = signal<SceneAnalysis[]>([]);

  /** Map of detectionEventId → SceneAnalysis for quick lookup */
  readonly analysisMap = signal<Map<string, SceneAnalysis>>(new Map());

  /** Signal indicating connection status */
  readonly connected = signal(false);

  /** Maximum events to keep in memory */
  private readonly maxEvents = 100;

  constructor() {
    this.connect();
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(environment.wsUrl, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
      this.connected.set(true);
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
      this.connected.set(false);
    });

    this.socket.on('detection', (event: DetectionEvent) => {
      this.recentEvents.update((events) => {
        const updated = [event, ...events];
        return updated.slice(0, this.maxEvents);
      });
    });

    this.socket.on('frame-detections', (detections: FrameDetection[]) => {
      this.currentFrameDetections.set(detections);
    });

    this.socket.on('scene-analysis', (analysis: SceneAnalysis) => {
      this.recentAnalyses.update((analyses) => {
        const updated = [analysis, ...analyses];
        return updated.slice(0, this.maxEvents);
      });
      this.analysisMap.update((map) => {
        const updated = new Map(map);
        updated.set(analysis.detectionEventId, analysis);
        return updated;
      });
    });

    this.socket.on('connect_error', (error: Error) => {
      console.warn('WebSocket connection error:', error.message);
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected.set(false);
  }

  /**
   * Clear the recent events buffer
   */
  clearEvents(): void {
    this.recentEvents.set([]);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
