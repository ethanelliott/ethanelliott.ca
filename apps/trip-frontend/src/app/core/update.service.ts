import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * Keeps the app on the latest deployed version: when the service worker has a
 * new version ready, it activates it and reloads, so a refresh always shows the
 * latest build. Updates are infrequent (only on deploy).
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private applying = false;

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY') this.apply();
    });

    // If the cached app ends up in a broken state, a reload recovers it.
    this.swUpdate.unrecoverable.subscribe(() => document.location.reload());

    // Poll for a new deployment every 30 minutes while the app is open.
    setInterval(
      () => this.swUpdate.checkForUpdate().catch(() => undefined),
      30 * 60 * 1000
    );
  }

  private async apply(): Promise<void> {
    if (this.applying) return;
    this.applying = true;
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // ignore — reload pulls the new version regardless
    }
    document.location.reload();
  }
}
