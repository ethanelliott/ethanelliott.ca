import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TripStore } from '../core/trip-store';
import { TripTabsComponent } from '../shared/trip-tabs.component';

/**
 * Shell for a trip and its sub-pages. Trip navigation lives in a left rail on
 * desktop and a bottom tab bar on mobile (Overview / Schedule / Map / Budget /
 * Packing). App-level nav (home, account) stays in the global header.
 */
@Component({
  selector: 'app-trip-layout',
  standalone: true,
  imports: [RouterOutlet, TripTabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="trip-shell">
      <nav class="rail">
        <app-trip-tabs [tripId]="id()" variant="rail" />
      </nav>

      <main class="trip-main">
        <router-outlet />
      </main>

      <app-trip-tabs class="bottom-bar" [tripId]="id()" variant="bottom" />
    </div>
  `,
  styles: `
    /* Fill the parent grid row (.app-content), then lay out our own rows. */
    :host {
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      flex: 1;
      min-height: 0;
    }
    /* Mobile: content scrolls (1fr), bottom nav pinned (auto). */
    .trip-shell {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      min-height: 0;
    }
    .rail {
      display: none;
    }
    .trip-main {
      min-width: 0;
      min-height: 0;
      overflow: auto;
    }
    .bottom-bar {
      background: var(--bg-surface);
      border-top: 1px solid var(--border);
      padding-bottom: var(--safe-bottom);
    }

    /* Desktop: rail column (auto) + content column (1fr), single row. */
    @media (min-width: 768px) {
      .trip-shell {
        grid-template-rows: minmax(0, 1fr);
        grid-template-columns: auto minmax(0, 1fr);
      }
      .rail {
        display: flex;
        flex-direction: column;
        width: 66px;
        padding: 8px 6px;
        background: var(--bg-surface);
        border-right: 1px solid var(--border);
        overflow-y: auto;
      }
      .bottom-bar {
        display: none;
      }
    }
  `,
})
export class TripLayoutComponent {
  private readonly store = inject(TripStore);

  /** :id route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  constructor() {
    // Scope the shared trip cache to the routed trip (clears it when the
    // param changes to a different trip).
    effect(() => this.store.setActive(this.id()));
  }
}
