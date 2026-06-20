import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface TabDef {
  label: string;
  icon: string;
  path: string[]; // segments appended after /trips/:id
  exact: boolean;
}

export type TripTabsVariant = 'rail' | 'bottom' | 'pills';

/**
 * Shared trip navigation. Rendered as a vertical rail (desktop) or a bottom
 * tab bar (mobile); highlights the active view via routerLinkActive.
 */
@Component({
  selector: 'app-trip-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="trip-tabs" [class]="variant()">
      @for (tab of tabs; track tab.label) {
        <a
          class="tab"
          [routerLink]="link(tab)"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: tab.exact }"
        >
          <i [class]="'pi ' + tab.icon"></i>
          <span>{{ tab.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }
    .trip-tabs {
      display: flex;
      gap: 4px;
    }
    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }

    /* Rail (desktop, vertical) */
    .trip-tabs.rail {
      flex-direction: column;
    }
    .trip-tabs.rail .tab {
      flex-direction: column;
      gap: 3px;
      width: 100%;
      padding: 9px 4px;
      border-radius: 10px;
      font-size: 10px;
      text-align: center;
      color: var(--text-secondary);
    }
    .trip-tabs.rail .tab i { font-size: 17px; }
    .trip-tabs.rail .tab.active { background: var(--brand); color: #fff; }
    .trip-tabs.rail .tab:not(.active):hover { background: var(--bg-subtle); }

    /* Bottom bar (mobile) */
    .trip-tabs.bottom {
      gap: 0;
    }
    .trip-tabs.bottom .tab {
      flex: 1;
      flex-direction: column;
      gap: 2px;
      padding: 7px 2px;
      font-size: 10px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .trip-tabs.bottom .tab i { font-size: 19px; }
    .trip-tabs.bottom .tab.active { color: var(--brand); }

    /* Pills (horizontal, scrollable) */
    .trip-tabs.pills {
      padding: 6px 8px;
      overflow-x: auto;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      scrollbar-width: none;
    }
    .trip-tabs.pills::-webkit-scrollbar { height: 0; }
    .trip-tabs.pills .tab {
      flex-shrink: 0;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .trip-tabs.pills .tab.active { background: var(--brand); color: #fff; }
  `,
})
export class TripTabsComponent {
  readonly tripId = input.required<string>();
  readonly variant = input<TripTabsVariant>('pills');

  readonly tabs: TabDef[] = [
    { label: 'Overview', icon: 'pi-list', path: [], exact: true },
    { label: 'Schedule', icon: 'pi-calendar', path: ['schedule'], exact: false },
    { label: 'Map', icon: 'pi-map', path: ['map'], exact: false },
    { label: 'Budget', icon: 'pi-wallet', path: ['budget'], exact: false },
    { label: 'Packing', icon: 'pi-briefcase', path: ['packing'], exact: false },
  ];

  link(tab: TabDef): unknown[] {
    return ['/trips', this.tripId(), ...tab.path];
  }
}
