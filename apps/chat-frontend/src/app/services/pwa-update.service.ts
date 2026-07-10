import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/**
 * Watches the service worker for new app versions and exposes a signal the
 * shell uses to show a "refresh to update" banner.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  readonly updateAvailable = signal(false);

  constructor() {
    const swUpdate = inject(SwUpdate);
    if (!swUpdate.isEnabled) return;

    swUpdate.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => this.updateAvailable.set(true));

    // Periodically check for updates while the app stays open (every 30 min)
    setInterval(() => {
      swUpdate.checkForUpdate().catch(() => {
        // Offline or SW in a broken state — ignore, next interval retries
      });
    }, 30 * 60 * 1000);
  }

  /** Reload to activate the new version (ngsw serves it on next load). */
  reload(): void {
    document.location.reload();
  }
}
