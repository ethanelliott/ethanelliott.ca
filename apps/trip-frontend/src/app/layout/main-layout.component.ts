import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ConnectivityService } from '../core/connectivity.service';
import { UpdateService } from '../core/update.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
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

            <button
              class="avatar"
              (click)="menuOpen.set(!menuOpen())"
              [title]="profileName()"
            >
              {{ initial() }}
            </button>
          </div>
        </div>
      </header>

      @if (menuOpen()) {
        <div class="menu-backdrop" (click)="menuOpen.set(false)"></div>
        <div class="account-menu card">
          <div class="account-head">
            <div class="account-name">{{ profileName() }}</div>
            @if (auth.profile()?.username; as u) {
              <div class="account-username muted">{{ '@' + u }}</div>
            }
          </div>
          <button class="menu-item" (click)="goProfile()">
            <i class="pi pi-user"></i> Profile
          </button>
          <button class="menu-item danger" (click)="logout()">
            <i class="pi pi-sign-out"></i> Log out
          </button>
        </div>
      }

      <main class="app-content">
        <router-outlet />
      </main>
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
      i { font-size: 20px; }
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
    .net-dot.off { background: #f59e0b; }
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
    .update-pill i { font-size: 12px; }

    .avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.22);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
    }

    .menu-backdrop {
      position: fixed;
      inset: 0;
      z-index: 49;
    }
    .account-menu {
      position: fixed;
      top: calc(var(--header-height) + 6px);
      right: 12px;
      z-index: 50;
      width: 220px;
      padding: 6px;
      overflow: hidden;
    }
    .account-head {
      padding: 10px 12px 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
    }
    .account-name { font-weight: 700; }
    .account-username { font-size: 12px; }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      border: none;
      background: transparent;
      cursor: pointer;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      text-align: left;
    }
    .menu-item:hover { background: var(--bg-subtle); }
    .menu-item.danger { color: #e8643c; }

    .app-content {
      flex: 1;
      min-height: 0;
    }
  `,
})
export class MainLayoutComponent {
  readonly auth = inject(AuthService);
  readonly connectivity = inject(ConnectivityService);
  readonly update = inject(UpdateService);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);

  readonly profileName = computed(
    () => this.auth.profile()?.name || this.auth.profile()?.username || 'Account'
  );
  readonly initial = computed(() =>
    (this.profileName().trim()[0] || '?').toUpperCase()
  );

  constructor() {
    if (!this.auth.profile()) {
      void this.auth.loadProfile();
    }
  }

  goProfile(): void {
    this.menuOpen.set(false);
    void this.router.navigate(['/profile']);
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
  }
}
