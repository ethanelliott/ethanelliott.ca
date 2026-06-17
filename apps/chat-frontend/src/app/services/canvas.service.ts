import { Injectable, signal } from '@angular/core';

/**
 * Transient UI state for the artifact canvas panel.
 *
 * Artifacts themselves are persisted on the conversation (see
 * ConversationService); this service only tracks ephemeral view state such as
 * whether the panel is open and which artifact/version is currently shown.
 */
@Injectable({ providedIn: 'root' })
export class CanvasService {
  /** Whether the canvas side panel is visible. */
  readonly isOpen = signal(false);

  /** The id of the artifact currently shown in the canvas (null = latest). */
  readonly activeArtifactId = signal<string | null>(null);

  open(artifactId?: string | null): void {
    if (artifactId !== undefined) {
      this.activeArtifactId.set(artifactId);
    }
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen.update((v) => !v);
  }
}
