import { Injectable, signal } from '@angular/core';

/**
 * Tracks whether the browser is online. Because the recipe book is local-first
 * — recipes, photos, categories and tags are cached by the service worker and
 * remain readable offline — the UI uses this only to show a passive "Offline"
 * badge so the user knows why edits/AI features may be unavailable. It is a
 * thin wrapper over `navigator.onLine` and its online/offline events; no
 * backend heartbeat, since browsing works offline regardless.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly _online = signal(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  /** True when the browser reports a network connection. */
  readonly online = this._online.asReadonly();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._online.set(true));
      window.addEventListener('offline', () => this._online.set(false));
    }
  }
}
