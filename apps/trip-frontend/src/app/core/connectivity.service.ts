import { Injectable, signal } from '@angular/core';

/**
 * Tracks online/offline state from the browser. Used to surface an offline
 * banner and to gate edits (which require the backend).
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  readonly online = signal(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }

  isOnline(): boolean {
    return this.online();
  }
}
