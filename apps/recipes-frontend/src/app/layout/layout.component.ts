import {
  ChangeDetectionStrategy,
  Component,
  signal,
  inject,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { UpdateService } from '../services/update.service';
import { ConnectivityService } from '../services/connectivity.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterModule, DrawerModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Mobile Header -->
    <div class="mobile-header">
      <p-button
        icon="pi pi-bars"
        [text]="true"
        severity="secondary"
        (click)="drawerVisible.set(true)"
      />
      <span class="mobile-title">
        <i class="pi pi-book"></i>
        Recipe Book
      </span>
      <span class="mobile-header-spacer"></span>
      @if (!connectivity.online()) {
        <span class="offline-badge" title="You're offline — viewing saved recipes">
          <i class="pi pi-cloud"></i>
        </span>
      }
      @if (update.updateReady()) {
        <button class="update-pill" (click)="update.apply()" title="Apply the new version">
          <i class="pi pi-sync"></i>
          Update
        </button>
      }
    </div>

    <!-- Mobile Drawer -->
    <p-drawer
      [(visible)]="drawerVisible"
      [modal]="true"
      [showCloseIcon]="false"
      styleClass="sidebar-drawer"
    >
      <ng-template #header>
        <div class="sidebar-brand">
          <i class="pi pi-book brand-icon"></i>
          <span class="brand-text">Recipe Book</span>
        </div>
      </ng-template>
      <nav class="sidebar-nav">
        <div class="nav-section-label">Main</div>
        @for (item of mainNav; track item.route) {
        <a
          class="nav-link"
          [routerLink]="item.route"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: item.route === '/recipes' }"
          (click)="drawerVisible.set(false)"
        >
          <i [class]="'pi ' + item.icon"></i>
          <span>{{ item.label }}</span>
        </a>
        }
        <div class="nav-section-label">Organize</div>
        @for (item of organizeNav; track item.route) {
        <a
          class="nav-link"
          [routerLink]="item.route"
          routerLinkActive="active"
          (click)="drawerVisible.set(false)"
        >
          <i [class]="'pi ' + item.icon"></i>
          <span>{{ item.label }}</span>
        </a>
        }
      </nav>
      <div class="sidebar-footer">
        @if (!connectivity.online()) {
          <div class="footer-offline">
            <i class="pi pi-cloud"></i>
            <span>Offline — viewing saved recipes</span>
          </div>
        }
        <button class="footer-update" (click)="onUpdateClick()">
          <i class="pi pi-sync" [class.spin]="update.checking()"></i>
          <span>
            @if (update.updateReady()) {
              Update ready — tap to apply
            } @else {
              {{ update.checking() ? 'Checking…' : checkLabel() }}
            }
          </span>
        </button>
      </div>
    </p-drawer>

    <!-- Desktop Sidebar -->
    <aside class="desktop-sidebar">
      <div class="sidebar-brand">
        <i class="pi pi-book brand-icon"></i>
        <span class="brand-text">Recipe Book</span>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section-label">Main</div>
        @for (item of mainNav; track item.route) {
        <a
          class="nav-link"
          [routerLink]="item.route"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: item.route === '/recipes' }"
        >
          <i [class]="'pi ' + item.icon"></i>
          <span>{{ item.label }}</span>
        </a>
        }
        <div class="nav-section-label">Organize</div>
        @for (item of organizeNav; track item.route) {
        <a class="nav-link" [routerLink]="item.route" routerLinkActive="active">
          <i [class]="'pi ' + item.icon"></i>
          <span>{{ item.label }}</span>
        </a>
        }
      </nav>
      <div class="sidebar-footer">
        @if (!connectivity.online()) {
          <div class="footer-offline">
            <i class="pi pi-cloud"></i>
            <span>Offline — viewing saved recipes</span>
          </div>
        }
        <button class="footer-update" (click)="onUpdateClick()">
          <i class="pi pi-sync" [class.spin]="update.checking()"></i>
          <span>
            @if (update.updateReady()) {
              Update ready — tap to apply
            } @else {
              {{ update.checking() ? 'Checking…' : checkLabel() }}
            }
          </span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      height: 100vh;
      overflow: hidden;
      background: var(--p-surface-950);
      color: var(--p-text-color);
    }

    .mobile-header {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 56px;
      background: var(--p-surface-900);
      border-bottom: 1px solid var(--p-surface-700);
      align-items: center;
      padding: 0 12px;
      gap: 8px;
      z-index: 100;
    }

    .mobile-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--p-primary-color);
    }

    .mobile-header-spacer {
      flex: 1;
    }

    .offline-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      color: var(--p-text-muted-color);
      background: var(--p-surface-800);
    }

    .update-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      cursor: pointer;
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--p-primary-color);
      color: var(--p-primary-contrast-color);
      font-weight: 700;
      font-size: 0.8rem;

      i {
        font-size: 0.8rem;
      }
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .spin {
      animation: spin 0.9s linear infinite;
    }

    .sidebar-footer {
      margin-top: auto;
      padding: 12px 8px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .footer-offline {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--p-text-muted-color);
      background: var(--p-surface-800);
    }

    .footer-update {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      border: none;
      background: transparent;
      cursor: pointer;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--p-text-muted-color);
      text-align: left;
      transition: all 0.15s ease;

      &:hover {
        background: var(--p-surface-800);
        color: var(--p-text-color);
      }
    }

    .desktop-sidebar {
      width: 220px;
      min-width: 220px;
      height: 100vh;
      background: var(--p-surface-900);
      border-right: 1px solid var(--p-surface-700);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 16px;
    }

    .brand-icon {
      font-size: 1.4rem;
      color: var(--p-primary-color);
    }

    .brand-text {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--p-text-color);
    }

    .sidebar-nav {
      display: flex;
      flex-direction: column;
      padding: 0 8px;
      gap: 2px;
    }

    .nav-section-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--p-text-muted-color);
      padding: 16px 12px 6px;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--p-text-muted-color);
      text-decoration: none;
      transition: all 0.15s ease;

      &:hover {
        background: var(--p-surface-800);
        color: var(--p-text-color);
      }

      &.active {
        background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
        color: var(--p-primary-color);
      }
    }

    .main-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    @media (max-width: 768px) {
      .mobile-header {
        display: flex;
      }

      .desktop-sidebar {
        display: none;
      }

      .main-content {
        padding: 72px 16px 16px;
        width: 100%;
      }
    }

    :host ::ng-deep .sidebar-drawer {
      .p-drawer-content {
        padding: 0;
        display: flex;
        flex-direction: column;
        height: 100%;
      }
    }
  `,
})
export class LayoutComponent {
  readonly update = inject(UpdateService);
  readonly connectivity = inject(ConnectivityService);

  drawerVisible = signal(false);
  readonly checkLabel = signal('Check for updates');

  mainNav: NavItem[] = [
    { label: 'Recipes', icon: 'pi-book', route: '/recipes' },
    { label: 'Random Recipe', icon: 'pi-sparkles', route: '/random' },
    { label: 'Grocery List', icon: 'pi-shopping-cart', route: '/grocery-list' },
  ];

  organizeNav: NavItem[] = [
    { label: 'Categories', icon: 'pi-th-large', route: '/categories' },
    { label: 'Tags', icon: 'pi-tags', route: '/tags' },
  ];

  async onUpdateClick(): Promise<void> {
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
}
