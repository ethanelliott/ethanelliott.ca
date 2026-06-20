import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TripTabsComponent } from '../shared/trip-tabs.component';

/**
 * Shell for a trip and its sub-pages: a persistent vertical nav rail on the
 * left (Overview / Schedule / Map / Budget / Packing) plus the routed view.
 * The rail replaces the per-page back buttons.
 */
@Component({
  selector: 'app-trip-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, TripTabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="trip-shell">
      <nav class="rail">
        <a class="rail-back" routerLink="/trips" title="All trips">
          <i class="pi pi-arrow-left"></i>
          <span>Trips</span>
        </a>
        <app-trip-tabs [tripId]="id()" [vertical]="true" />
      </nav>
      <main class="trip-main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    .trip-shell {
      display: flex;
      align-items: flex-start;
      min-height: calc(100dvh - var(--header-height));
    }
    .rail {
      position: sticky;
      top: var(--header-height);
      flex-shrink: 0;
      width: 66px;
      height: calc(100dvh - var(--header-height));
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 6px;
      background: var(--bg-surface);
      border-right: 1px solid var(--border);
      overflow-y: auto;
      scrollbar-width: none;
      z-index: 10;
    }
    .rail::-webkit-scrollbar {
      width: 0;
    }
    .rail-back {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 9px 4px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .rail-back i {
      font-size: 17px;
    }
    .rail-back:hover {
      background: var(--bg-subtle);
    }
    .trip-main {
      flex: 1;
      min-width: 0;
    }
  `,
})
export class TripLayoutComponent {
  /** :id route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();
}
