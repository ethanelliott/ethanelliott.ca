import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterModule } from '@angular/router';
import { FinanceApiService } from '../services/finance-api.service';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-dashboard',
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
          [mode]="isMobile() ? 'over' : 'side'"
          [opened]="!isMobile()"
        >
          <div class="sidenav-wrapper">
            <div class="sidenav-header">
              <div class="logo-container">
                <mat-icon class="logo-icon">account_balance_wallet</mat-icon>
                <span class="logo-text">Finances</span>
              </div>
            </div>
            <div class="sidenav-main">
              <mat-nav-list class="nav-list">
                <a
                  mat-list-item
                  routerLink="/dashboard/all-time"
                  routerLinkActive="active-link"
                  (click)="closeSidenavOnMobile()"
                >
                  <mat-icon matListItemIcon>trending_up</mat-icon>
                  <span matListItemTitle>All-Time Overview</span>
                </a>

                <a
                  mat-list-item
                  routerLink="/dashboard/monthly-habits"
                  routerLinkActive="active-link"
                  (click)="closeSidenavOnMobile()"
                >
                  <mat-icon matListItemIcon>calendar_month ></mat-icon>
                  <span matListItemTitle>Monthly Habits</span>
                </a>

                <a
                  mat-list-item
                  routerLink="/dashboard/transactions"
                  routerLinkActive="active-link"
                  (click)="closeSidenavOnMobile()"
                >
                  <mat-icon matListItemIcon>receipt</mat-icon>
                  <span matListItemTitle>Transactions</span>
                </a>

                <a
                  mat-list-item
                  routerLink="/dashboard/transfers"
                  routerLinkActive="active-link"
                  (click)="closeSidenavOnMobile()"
                >
                  <mat-icon matListItemIcon>swap_horiz</mat-icon>
                  <span matListItemTitle>Transfers</span>
                </a>

                <div class="nav-section-title">Manage</div>

                <a
                  mat-list-item
                  routerLink="/dashboard/accounts"
                  routerLinkActive="active-link"
                  (click)="closeSidenavOnMobile()"
                >
                  <mat-icon matListItemIcon>account_balance_wallet</mat-icon>
                  <span matListItemTitle>Accounts</span>
                </a>

                <a
                  mat-list-item
                  routerLink="/dashboard/categories"
                  routerLinkActive="active-link"
                  (click)="closeSidenavOnMobile()"
                >
                  <mat-icon matListItemIcon>category</mat-icon>
                  <span matListItemTitle>Categories</span>
                </a>

                <a
                  mat-list-item
                  routerLink="/dashboard/tags"
                  routerLinkActive="active-link"
                  (click)="closeSidenavOnMobile()"
                >
                  <mat-icon matListItemIcon>sell</mat-icon>
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
                  (click)="closeSidenavOnMobile()"
                >
                  <mat-icon matListItemIcon>person</mat-icon>
                  <span matListItemTitle>Profile</span>
                </a>

                <a mat-list-item (click)="logout()" class="logout-item">
                  <mat-icon matListItemIcon>logout ></mat-icon>
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
              [style.display]="isMobile() ? 'block' : 'none'"
            >
              <mat-icon>menu</mat-icon>
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
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly drawer = viewChild.required<MatSidenav>('drawer');

  isMobile = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((result) => result.matches)),
    { initialValue: false }
  );

  currentPageTitle = signal('Dashboard');

  ngOnInit() {
    this.updatePageTitle();
    this.router.events.subscribe(() => {
      this.updatePageTitle();
    });
  }

  closeSidenavOnMobile() {
    if (this.isMobile()) {
      this.drawer().close();
    }
  }

  private updatePageTitle() {
    const url = this.router.url;
    if (url.includes('/all-time')) {
      this.currentPageTitle.set('All-Time Overview');
    } else if (url.includes('/monthly-habits')) {
      this.currentPageTitle.set('Monthly Habits');
    } else if (url.includes('/transactions')) {
      this.currentPageTitle.set('Transactions');
    } else if (url.includes('/transfers')) {
      this.currentPageTitle.set('Transfers');
    } else if (url.includes('/accounts')) {
      this.currentPageTitle.set('Accounts');
    } else if (url.includes('/categories')) {
      this.currentPageTitle.set('Categories');
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
