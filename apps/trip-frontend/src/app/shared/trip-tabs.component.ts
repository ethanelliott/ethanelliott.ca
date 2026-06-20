import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface TabDef {
  label: string;
  icon: string;
  path: string[]; // segments appended after /trips/:id
  exact: boolean;
}

/**
 * Shared tab bar for a trip and its sub-pages. Highlights the active view via
 * routerLinkActive so it reads as navigation, not a primary action button.
 */
@Component({
  selector: 'app-trip-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="trip-tabs">
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
    .trip-tabs {
      display: flex;
      gap: 4px;
      padding: 6px 8px;
      overflow-x: auto;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .trip-tabs::-webkit-scrollbar {
      height: 0;
    }
    .tab {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .tab i {
      font-size: 14px;
    }
    .tab.active {
      background: var(--brand);
      color: #fff;
    }
    .tab:not(.active):hover {
      background: var(--bg-subtle);
    }
  `,
})
export class TripTabsComponent {
  readonly tripId = input.required<string>();

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
