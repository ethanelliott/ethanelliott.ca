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
import { ThemeService } from '../core/theme.service';
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
              <button class="update-pill" (click)="update.apply()" title="Apply the new version">
                <i class="pi pi-sync"></i> Update
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
              aria-label="Account menu"
              [attr.aria-expanded]="menuOpen()"
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

          <div class="theme-row">
            <span class="theme-label muted">Theme</span>
            <div class="theme-switch">
              <button
                class="theme-opt"
                [class.active]="theme.pref() === 'light'"
                (click)="theme.setPref('light')"
                title="Light"
                aria-label="Light theme"
              >
                <i class="pi pi-sun"></i>
              </button>
              <button
                class="theme-opt"
                [class.active]="theme.pref() === 'dark'"
                (click)="theme.setPref('dark')"
                title="Dark"
                aria-label="Dark theme"
              >
                <i class="pi pi-moon"></i>
              </button>
              <button
                class="theme-opt"
                [class.active]="theme.pref() === 'system'"
                (click)="theme.setPref('system')"
                title="System"
                aria-label="System theme"
              >
                <i class="pi pi-desktop"></i>
              </button>
            </div>
          </div>

          <button class="menu-item" (click)="checkUpdates()">
            <i class="pi pi-sync" [class.spin]="update.checking()"></i>
            @if (update.updateReady()) {
              Update ready — tap to apply
            } @else {
              {{ update.checking() ? 'Checking…' : checkLabel() }}
            }
          </button>

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
      height: 100vh;
      height: 100svh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
    }

    .app-header {
      flex-shrink: 0;
      z-index: 40;
      box-sizing: border-box;
      height: calc(var(--header-height) + var(--safe-top));
      padding-top: var(--safe-top);
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
      i { font-size: 13px; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .spin { animation: spin 0.9s linear infinite; }

    .net-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
      flex-shrink: 0;
    }
    .net-dot.off { background: #f59e0b; }

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
    .theme-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
    }
    .theme-label { font-size: 13px; font-weight: 600; }
    .theme-switch {
      display: flex;
      gap: 2px;
      background: var(--bg-subtle);
      border-radius: 9px;
      padding: 2px;
    }
    .theme-opt {
      width: 30px;
      height: 28px;
      border: none;
      background: transparent;
      border-radius: 7px;
      cursor: pointer;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .theme-opt.active {
      background: var(--bg-surface);
      color: var(--brand);
      box-shadow: var(--shadow-sm);
    }
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
    .menu-item.danger { color: var(--danger); }

    .app-content {
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
  `,
})
export class MainLayoutComponent {
  readonly auth = inject(AuthService);
  readonly connectivity = inject(ConnectivityService);
  readonly update = inject(UpdateService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);
  readonly checkLabel = signal('Check for updates');

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

  async checkUpdates(): Promise<void> {
    if (this.update.updateReady()) {
      await this.update.apply();
      return;
    }
    const found = await this.update.check();
    if (!found) {
      this.checkLabel.set('Up to date');
      setTimeout(() => this.checkLabel.set('Check for updates'), 2500);
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
