import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { AuthService } from '../core/auth.service';

interface NavItem {
  label: string;
  icon: string;
  link: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <header class="app-header">
        <div class="header-inner">
          <a class="brand" routerLink="/groups">
            <i class="pi pi-wallet"></i>
            <span>Split</span>
          </a>

          <nav class="desktop-nav">
            @for (item of nav; track item.link) {
              <a
                [routerLink]="item.link"
                routerLinkActive="active"
                class="desktop-nav-link"
              >
                <i [class]="'pi ' + item.icon"></i>
                {{ item.label }}
              </a>
            }
          </nav>
        </div>
      </header>

      <main class="app-content">
        <router-outlet />
      </main>

      <nav class="bottom-nav">
        @for (item of nav; track item.link) {
          <a
            [routerLink]="item.link"
            routerLinkActive="active"
            class="bottom-nav-link"
          >
            <i [class]="'pi ' + item.icon"></i>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: `
    .shell {
      // dvh tracks the visible viewport as mobile browsers collapse/expand
      // their URL bar; plain vh overshoots while the bar is visible.
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
    }

    .app-header {
      position: sticky;
      top: 0;
      z-index: 40;
      height: var(--header-height);
      background: var(--brand);
      color: #fff;
      box-shadow: var(--shadow-sm);
    }

    .header-inner {
      max-width: var(--content-max-width);
      margin: 0 auto;
      height: 100%;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #fff;
      font-weight: 700;
      font-size: 18px;

      i {
        font-size: 20px;
      }
    }

    .desktop-nav {
      display: none;
      gap: 4px;
    }

    .desktop-nav-link {
      color: rgba(255, 255, 255, 0.85);
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;

      &.active {
        background: rgba(255, 255, 255, 0.18);
        color: #fff;
      }
    }

    .app-content {
      flex: 1;
      padding-bottom: calc(
        var(--bottom-nav-height) + var(--safe-bottom) + 16px
      );
    }

    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 40;
      // The safe-area inset must grow the bar, not eat into the fixed
      // height — otherwise the links get squished when the inset appears
      // (e.g. when the URL bar retracts on iOS).
      height: calc(var(--bottom-nav-height) + var(--safe-bottom));
      padding-bottom: var(--safe-bottom);
      background: var(--bg-surface);
      border-top: 1px solid var(--border);
      display: flex;
    }

    .bottom-nav-link {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 600;

      i {
        font-size: 20px;
      }

      &.active {
        color: var(--brand);
      }
    }

    @media (min-width: 768px) {
      .desktop-nav {
        display: flex;
      }
      .bottom-nav {
        display: none;
      }
      .app-content {
        padding-bottom: 16px;
      }
    }
  `,
})
export class MainLayoutComponent {
  private readonly auth = inject(AuthService);

  readonly nav: NavItem[] = [
    { label: 'Groups', icon: 'pi-users', link: '/groups' },
    { label: 'Activity', icon: 'pi-clock', link: '/activity' },
    { label: 'Account', icon: 'pi-user', link: '/profile' },
  ];

  constructor() {
    // Warm the profile cache once the shell mounts.
    if (!this.auth.profile()) {
      void this.auth.loadProfile();
    }
  }
}
