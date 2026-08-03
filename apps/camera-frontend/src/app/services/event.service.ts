import { Injectable, OnDestroy, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import {
  DetectionEvent,
  FrameDetection,
  SceneAnalysis,
} from './camera-api.service';

/**
 * Live detection stream over Socket.io.
 *
 * Scene analysis arrives seconds after the detection that triggered it, on a
 * separate channel. This service reunites them, so consumers always see one
 * event object that either has its analysis or does not yet — no parallel
 * lookup map to keep in sync.
 */
@Injectable({ providedIn: 'root' })
export class EventService implements OnDestroy {
  private socket: Socket | null = null;

  /** Latest detection events, most recent first, analysis attached. */
  readonly recentEvents = signal<DetectionEvent[]>([]);

  /** All detections in the newest frame, for the live overlay. */
  readonly currentFrameDetections = signal<FrameDetection[]>([]);

  readonly connected = signal(false);

  /** Maximum events to keep in memory */
  private readonly maxEvents = 100;

  /**
   * Analyses that arrived before their detection was in the buffer (a page
   * load mid-analysis, say). Held briefly so the pairing is not lost.
   */
  private readonly orphanedAnalyses = new Map<string, SceneAnalysis>();

  constructor() {
    this.connect();
  }

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
      const pending = this.orphanedAnalyses.get(event.id);
      if (pending) {
        this.orphanedAnalyses.delete(event.id);
        event = { ...event, analysis: pending };
      }
      this.recentEvents.update((events) =>
        [event, ...events.filter((e) => e.id !== event.id)].slice(
          0,
          this.maxEvents
        )
      );
    });

    this.socket.on('frame-detections', (detections: FrameDetection[]) => {
      this.currentFrameDetections.set(detections);
    });

    this.socket.on('scene-analysis', (analysis: SceneAnalysis) => {
      let matched = false;
      this.recentEvents.update((events) =>
        events.map((event) => {
          if (event.id !== analysis.detectionEventId) return event;
          matched = true;
          return { ...event, analysis };
        })
      );

      if (!matched) {
        this.orphanedAnalyses.set(analysis.detectionEventId, analysis);
        // Bound the holding area; these only matter for a few seconds.
        if (this.orphanedAnalyses.size > 50) {
          const oldest = this.orphanedAnalyses.keys().next().value;
          if (oldest) this.orphanedAnalyses.delete(oldest);
        }
      }
    });

    this.socket.on('connect_error', (error: Error) => {
      console.warn('WebSocket connection error:', error.message);
    });
  }

  /**
   * Merge historical events fetched over HTTP into the live buffer, so a
   * freshly loaded page shows recent activity instead of waiting for the
   * next detection. Live copies win — they are never staler.
   */
  seed(events: DetectionEvent[]): void {
    this.recentEvents.update((current) => {
      const byId = new Map(events.map((event) => [event.id, event]));
      for (const event of current) byId.set(event.id, event);
      return [...byId.values()]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, this.maxEvents);
    });
  }

  /** Apply a pin toggle from the API to the live buffer. */
  patch(updated: DetectionEvent): void {
    this.recentEvents.update((events) =>
      events.map((event) =>
        event.id === updated.id ? { ...updated, analysis: event.analysis } : event
      )
    );
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected.set(false);
  }

  clearEvents(): void {
    this.recentEvents.set([]);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
