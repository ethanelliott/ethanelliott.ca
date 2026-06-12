import { Injectable, signal } from '@angular/core';

/**
 * Tracks the desktop/mobile breakpoint as a signal so components can branch
 * behaviour (not just styling) between form factors. Keep the query in sync
 * with the 768px breakpoint used in styles.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly query = window.matchMedia('(min-width: 768px)');

  readonly isDesktop = signal(this.query.matches);

  constructor() {
    this.query.addEventListener('change', (event) =>
      this.isDesktop.set(event.matches)
    );
  }
}
