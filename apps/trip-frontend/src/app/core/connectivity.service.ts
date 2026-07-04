import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Tracks real connectivity: the browser's online flag AND whether the backend
 * is actually reachable (a lightweight heartbeat to /liveness). Editing is
 * gated on this, and the header dot reflects it.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly navOnline = signal(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  private readonly backendUp = signal(true);

  /** True only when the browser is online and the backend answered recently. */
  readonly online = computed(() => this.navOnline() && this.backendUp());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.navOnline.set(true);
        void this.ping();
      });
      window.addEventListener('offline', () => {
        this.navOnline.set(false);
        this.backendUp.set(false);
      });
      // Don't burn battery pinging from a backgrounded tab; re-check as soon
      // as the app is visible again.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.ping();
      });
    }
    void this.ping();
    setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void this.ping();
      }
    }, 30_000);
  }

  isOnline(): boolean {
    return this.online();
  }

  private async ping(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.backendUp.set(false);
      return;
    }
    try {
      const res = await fetch(`${environment.apiUrl}/liveness`, {
        method: 'GET',
        cache: 'no-store',
      });
      this.backendUp.set(res.ok);
    } catch {
      this.backendUp.set(false);
    }
  }
}
