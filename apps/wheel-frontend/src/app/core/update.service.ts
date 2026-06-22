import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * Tracks service-worker updates. When a new deployed version is ready it flips
 * `updateReady` so the UI can surface an Update affordance; the user applies it
 * (activate + reload) on their own terms via `apply()`. `check()` lets the user
 * manually poll for a new deployment.
 *
 * The service worker only caches the app shell — Wheel always talks to the
 * network for API calls — so this exists purely to keep installed clients up
 * to date.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private applying = false;

  /** True once a new version has been downloaded and is ready to activate. */
  readonly updateReady = signal(false);
  /** True while a manual check is in flight. */
  readonly checking = signal(false);

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY') this.updateReady.set(true);
    });

    // If the cached app ends up in a broken state, a reload recovers it.
    this.swUpdate.unrecoverable.subscribe(() => document.location.reload());

    // Poll for a new deployment every 30 minutes while the app is open.
    setInterval(
      () => this.swUpdate.checkForUpdate().catch(() => undefined),
      30 * 60 * 1000
    );
  }

  /** Manually check for a new deployment. Resolves true if one is available. */
  async check(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) return false;
    this.checking.set(true);
    try {
      const found = await this.swUpdate.checkForUpdate();
      if (found) this.updateReady.set(true);
      return found;
    } catch {
      return false;
    } finally {
      this.checking.set(false);
    }
  }

  /** Activate the ready update and reload into it. */
  async apply(): Promise<void> {
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
