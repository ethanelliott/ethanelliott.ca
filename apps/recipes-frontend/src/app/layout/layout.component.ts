import {
  ChangeDetectionStrategy,
  Component,
  signal,
  inject,
} from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

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
      }
    }
  `,
})
export class LayoutComponent {
  drawerVisible = signal(false);

  mainNav: NavItem[] = [
    { label: 'Recipes', icon: 'pi-book', route: '/recipes' },
    { label: 'Random Recipe', icon: 'pi-sparkles', route: '/random' },
    { label: 'Grocery List', icon: 'pi-shopping-cart', route: '/grocery-list' },
  ];

  organizeNav: NavItem[] = [
    { label: 'Categories', icon: 'pi-th-large', route: '/categories' },
    { label: 'Tags', icon: 'pi-tags', route: '/tags' },
  ];
}
