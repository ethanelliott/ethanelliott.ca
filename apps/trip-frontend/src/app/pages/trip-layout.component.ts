import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
    :host {
      display: block;
      height: 100%;
    }
    .trip-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .rail {
      display: none;
    }
    .trip-main {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow: auto;
    }
    .bottom-bar {
      flex-shrink: 0;
      background: var(--bg-surface);
      border-top: 1px solid var(--border);
      padding-bottom: var(--safe-bottom);
    }

    @media (min-width: 768px) {
      .trip-shell {
        flex-direction: row;
      }
      .rail {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        width: 66px;
        height: 100%;
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
  /** :id route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();
}
