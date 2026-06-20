import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ConnectivityService } from '../core/connectivity.service';
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
          <a class="brand" routerLink="/trips">
            <i class="pi pi-compass"></i>
            <span>Trip</span>
          </a>

          <div class="header-actions">
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

            @if (update.updateReady()) {
              <button class="update-pill" (click)="update.reload()" title="A new version is ready">
                <i class="pi pi-refresh"></i> Update
              </button>
            }

            <span
              class="net-dot"
              [class.off]="!connectivity.online()"
              [title]="connectivity.online() ? 'Online' : 'Offline — editing paused'"
            ></span>
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

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .net-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
      flex-shrink: 0;
    }
    .net-dot.off {
      background: #f59e0b;
    }
    .update-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: none;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
      font-weight: 600;
      font-size: 12px;
      padding: 5px 11px;
      border-radius: 999px;
    }
    .update-pill i {
      font-size: 12px;
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
  readonly connectivity = inject(ConnectivityService);
  readonly update = inject(UpdateService);

  readonly nav: NavItem[] = [
    { label: 'Trips', icon: 'pi-map', link: '/trips' },
    { label: 'Account', icon: 'pi-user', link: '/profile' },
  ];

  constructor() {
    // Warm the profile cache once the shell mounts.
    if (!this.auth.profile()) {
      void this.auth.loadProfile();
    }
  }
}
