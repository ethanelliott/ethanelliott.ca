import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterModule } from '@angular/router';
import { FinanceApiService } from '../services/finance-api.service';

@Component({
  selector: 'fin-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterModule,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
  ],
  template: `
    <div class="dashboard-container">
      <mat-sidenav-container class="sidenav-container">
        <mat-sidenav
          #drawer
          class="sidenav"
          fixedInViewport
          [attr.role]="'navigation'"
          [mode]="'side'"
          [opened]="true"
        >
          <div class="sidenav-wrapper">
            <div class="sidenav-header">
              <div class="logo-container">
                <mat-icon class="logo-icon" fontIcon="fa-wallet"></mat-icon>
                <span class="logo-text">Finances</span>
              </div>
            </div>
            <div class="sidenav-main">
              <mat-nav-list class="nav-list">
                <a
                  mat-list-item
                  routerLink="/dashboard/overview"
                  routerLinkActive="active-link"
                >
                  <mat-icon matListItemIcon fontIcon="fa-chart-line"></mat-icon>
                  <span matListItemTitle>Overview</span>
                </a>

                <a
                  mat-list-item
                  routerLink="/dashboard/transactions"
                  routerLinkActive="active-link"
                >
                  <mat-icon matListItemIcon fontIcon="fa-receipt"></mat-icon>
                  <span matListItemTitle>Transactions</span>
                </a>

                <div class="nav-section-title">Manage</div>

                <a
                  mat-list-item
                  routerLink="/dashboard/categories"
                  routerLinkActive="active-link"
                >
                  <mat-icon
                    matListItemIcon
                    fontIcon="fa-layer-group"
                  ></mat-icon>
                  <span matListItemTitle>Categories</span>
                </a>

                <a
                  mat-list-item
                  routerLink="/dashboard/mediums"
                  routerLinkActive="active-link"
                >
                  <mat-icon
                    matListItemIcon
                    fontIcon="fa-credit-card"
                  ></mat-icon>
                  <span matListItemTitle>Payment Methods</span>
                </a>

                <a
                  mat-list-item
                  routerLink="/dashboard/tags"
                  routerLinkActive="active-link"
                >
                  <mat-icon matListItemIcon fontIcon="fa-tag"></mat-icon>
                  <span matListItemTitle>Tags</span>
                </a>
              </mat-nav-list>
            </div>

            <div class="sidenav-footer">
              <mat-nav-list>
                <a
                  mat-list-item
                  routerLink="/dashboard/profile"
                  routerLinkActive="active-link"
                >
                  <mat-icon matListItemIcon fontIcon="fa-user"></mat-icon>
                  <span matListItemTitle>Profile</span>
                </a>

                <a mat-list-item (click)="logout()" class="logout-item">
                  <mat-icon
                    matListItemIcon
                    fontIcon="fa-right-from-bracket"
                  ></mat-icon>
                  <span matListItemTitle>Logout</span>
                </a>
              </mat-nav-list>
            </div>
          </div>
        </mat-sidenav>

        <mat-sidenav-content class="main-content">
          <mat-toolbar class="toolbar" color="primary">
            <button
              type="button"
              aria-label="Toggle sidenav"
              mat-icon-button
              (click)="drawer.toggle()"
              class="menu-button"
            >
              <mat-icon fontIcon="fa-bars"></mat-icon>
            </button>

            <span class="toolbar-title">{{ currentPageTitle() }}</span>
          </mat-toolbar>

          <div class="content-container">
            <router-outlet />
          </div>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
  styles: `
    .dashboard-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .sidenav-container {
      flex: 1;
    }

    .sidenav {
      width: 280px;
      --mat-sidenav-container-background-color: var(--mat-sys-surface-container-high);
      display: flex;
      flex-direction: column;
    }

    .sidenav-header {
      padding: 24px 16px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: var(--mat-sys-primary);
    }

    .logo-text {
      font-size: 1.5rem;
      color: var(--mat-sys-on-surface);
    }

    .nav-list {
      padding: 8px 0;
      flex: 1;
    }

    .sidenav-wrapper {
      height: 100%;
      display: flex;
      flex: 1;
      flex-direction: column;
    }

    .sidenav-main {
      display: flex;
      flex: 1;
      flex-direction: column;
    }

    .sidenav-footer {
      margin-top: auto;
      border-top: 1px solid var(--mat-sys-outline-variant);
      padding-top: 8px;
    }

    .logout-item {
      cursor: pointer;
    }

    .nav-section-title {
      padding: 16px 16px 8px 16px;
      font-size: 12px;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .active-link {
      background: var(--mat-sys-primary-container) !important;
      color: var(--mat-sys-on-primary-container) !important;
    }

    .active-link mat-icon {
      color: var(--mat-sys-on-primary-container) !important;
    }

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .menu-button {
      margin-right: 16px;
    }

    .toolbar-title {
      flex: 1;
      font-size: 20px;
      font-weight: 500;
    }

    .content-container {
      background: var(--mat-sys-surface);
      min-height: calc(100vh - 64px);
    }

    @media (max-width: 768px) {
      .sidenav {
        width: 100%;
      }
      
      .content-container {
        padding: 16px;
      }
    }
  `,
})
export class Dashboard implements OnInit {
  private readonly router = inject(Router);
  private readonly apiService = inject(FinanceApiService);

  currentPageTitle = signal('Dashboard');

  ngOnInit() {
    this.updatePageTitle();
    this.router.events.subscribe(() => {
      this.updatePageTitle();
    });
  }

  private updatePageTitle() {
    const url = this.router.url;
    if (url.includes('/overview')) {
      this.currentPageTitle.set('Overview');
    } else if (url.includes('/transactions')) {
      this.currentPageTitle.set('Transactions');
    } else if (url.includes('/categories')) {
      this.currentPageTitle.set('Categories');
    } else if (url.includes('/mediums')) {
      this.currentPageTitle.set('Payment Methods');
    } else if (url.includes('/tags')) {
      this.currentPageTitle.set('Tags');
    } else if (url.includes('/profile')) {
      this.currentPageTitle.set('Profile');
    } else {
      this.currentPageTitle.set('Dashboard');
    }
  }

  logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    this.apiService.logout(refreshToken || undefined).subscribe({
      next: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        this.router.navigate(['/']);
      },
      error: (error) => {
        console.error('Logout error:', error);
        // Clear tokens anyway
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        this.router.navigate(['/']);
      },
    });
  }
}
