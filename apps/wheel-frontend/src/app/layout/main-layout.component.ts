import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { AuthService } from '../core/auth.service';
import { UpdateService } from '../core/update.service';

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
          <a class="brand" routerLink="/wheels">
            <i class="pi pi-bullseye"></i>
            <span>Wheel</span>
          </a>

          <div class="header-right">
            @if (update.updateReady()) {
              <button
                class="update-pill"
                (click)="update.apply()"
                title="Apply the new version"
              >
                <i class="pi pi-sync"></i> Update
              </button>
            }

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

    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .update-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      cursor: pointer;
      padding: 5px 12px;
      border-radius: 999px;
      background: #fff;
      color: var(--brand);
      font-weight: 700;
      font-size: 13px;
      box-shadow: var(--shadow-sm);

      i {
        font-size: 13px;
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
  readonly update = inject(UpdateService);

  readonly nav: NavItem[] = [
    { label: 'Wheels', icon: 'pi-bullseye', link: '/wheels' },
    { label: 'Account', icon: 'pi-user', link: '/profile' },
  ];

  constructor() {
    // Warm the profile cache once the shell mounts.
    if (!this.auth.profile()) {
      void this.auth.loadProfile();
    }
  }
}
