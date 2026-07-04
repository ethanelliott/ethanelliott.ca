import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { ConnectivityService } from './connectivity.service';
import { TripStore } from './trip-store';

const STORAGE_KEY = 'trip-offline-queue';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface QueuedWrite {
  method: 'PUT';
  url: string;
  body: unknown;
  queuedAt: number;
}

/**
 * Persists QUEUE_IF_OFFLINE mutations made while offline and replays them, in
 * order, once the backend is reachable again. Successfully synced slices are
 * force-refreshed so the UI reconciles with the server.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly http = inject(HttpClient);
  private readonly connectivity = inject(ConnectivityService);
  private readonly messages = inject(MessageService);
  private readonly store = inject(TripStore);

  private replaying = false;
  readonly pendingCount = signal(this.read().length);

  constructor() {
    effect(() => {
      if (this.connectivity.online()) void this.replay();
    });
  }

  enqueue(method: 'PUT', url: string, body: unknown): void {
    const queue = this.read();
    queue.push({ method, url, body, queuedAt: Date.now() });
    this.persist(queue);
    this.messages.add({
      severity: 'info',
      summary: 'Saved offline',
      detail: 'This change will sync when you reconnect.',
    });
  }

  private async replay(): Promise<void> {
    if (this.replaying) return;
    const queue = this.read().filter(
      (w) => Date.now() - w.queuedAt < MAX_AGE_MS
    );
    this.persist(queue);
    if (queue.length === 0) return;

    this.replaying = true;
    let synced = 0;
    try {
      while (queue.length > 0 && this.connectivity.isOnline()) {
        const write = queue[0];
        try {
          await firstValueFrom(
            this.http.request(write.method, write.url, { body: write.body })
          );
          synced++;
          queue.shift();
          this.persist(queue);
        } catch (e) {
          const status = (e as HttpErrorResponse).status ?? 0;
          if (status >= 400 && status < 500) {
            // Rejected by the server (stale/invalid) — drop it and move on.
            queue.shift();
            this.persist(queue);
          } else {
            // Network/server trouble — keep the queue and retry later.
            break;
          }
        }
      }
    } finally {
      this.replaying = false;
      this.pendingCount.set(this.read().length);
    }

    if (synced > 0) {
      this.messages.add({
        severity: 'success',
        summary: 'Back online',
        detail: `Synced ${synced} offline change${synced === 1 ? '' : 's'}.`,
      });
      // Reconcile the slices queued writes can touch.
      void this.store.loadPacking(true);
      void this.store.loadExpenses(true);
    }
  }

  private read(): QueuedWrite[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
    } catch {
      return [];
    }
  }

  private persist(queue: QueuedWrite[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // storage full/unavailable — the optimistic UI still applied
    }
    this.pendingCount.set(queue.length);
  }
}
