import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * Watches for new service-worker versions. When one is ready, exposes
 * `updateReady` so the UI can offer a reload, and checks periodically.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly swUpdate = inject(SwUpdate);
  readonly updateReady = signal(false);

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY') {
        this.updateReady.set(true);
      }
    });

    // Check for a new deployment hourly (and once shortly after load).
    setInterval(
      () => this.swUpdate.checkForUpdate().catch(() => undefined),
      60 * 60 * 1000
    );
  }

  async reload(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // ignore — reload will pull the new version regardless
    }
    document.location.reload();
  }
}
