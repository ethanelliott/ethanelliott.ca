import {
  ChangeDetectionStrategy,
  Component,
  signal,
  HostListener,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RouterModule,
  RouterLink,
  RouterLinkActive,
  NavigationEnd,
  Router,
} from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav
        #sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()"
        class="sidenav"
        [class.mobile]="isMobile()"
      >
        <div class="sidenav-header">
          <div class="logo-container">
            <div class="logo-icon-wrapper">
              <mat-icon class="logo-icon">restaurant_menu</mat-icon>
            </div>
            <span class="logo-text">Recipe Book</span>
          </div>
        </div>
        <nav class="nav-section">
          <span class="nav-label">Main</span>
          <mat-nav-list>
            <a
              mat-list-item
              routerLink="/recipes"
              routerLinkActive="active"
              (click)="onNavClick()"
            >
              <mat-icon matListItemIcon>menu_book</mat-icon>
              <span matListItemTitle>Recipes</span>
            </a>
            <a
              mat-list-item
              routerLink="/random"
              routerLinkActive="active"
              (click)="onNavClick()"
            >
              <mat-icon matListItemIcon>casino</mat-icon>
              <span matListItemTitle>Random Recipe</span>
            </a>
            <a
              mat-list-item
              routerLink="/grocery-list"
              routerLinkActive="active"
              (click)="onNavClick()"
            >
              <mat-icon matListItemIcon>shopping_cart</mat-icon>
              <span matListItemTitle>Grocery List</span>
            </a>
          </mat-nav-list>
        </nav>
        <nav class="nav-section">
          <span class="nav-label">Organize</span>
          <mat-nav-list>
            <a
              mat-list-item
              routerLink="/categories"
              routerLinkActive="active"
              (click)="onNavClick()"
            >
              <mat-icon matListItemIcon>category</mat-icon>
              <span matListItemTitle>Categories</span>
            </a>
            <a
              mat-list-item
              routerLink="/tags"
              routerLinkActive="active"
              (click)="onNavClick()"
            >
              <mat-icon matListItemIcon>label</mat-icon>
              <span matListItemTitle>Tags</span>
            </a>
          </mat-nav-list>
        </nav>
      </mat-sidenav>

      <mat-sidenav-content class="content" [class.mobile]="isMobile()">
        @if (isMobile()) {
        <div class="mobile-header">
          <button mat-icon-button (click)="sidenav.toggle()" class="menu-btn">
            <mat-icon>menu</mat-icon>
          </button>
          <div class="mobile-logo">
            <mat-icon>restaurant_menu</mat-icon>
            <span>Recipe Book</span>
          </div>
        </div>
        }
        <div class="content-wrapper" [class.mobile]="isMobile()">
          <router-outlet />
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .sidenav-container {
      height: 100vh;
    }

    .sidenav {
      width: 260px;
      background: linear-gradient(180deg, #0a0a0a 0%, #000000 100%);
      border-right: 1px solid var(--border-subtle);
    }

    .sidenav.mobile {
      width: 280px;
    }

    .sidenav-header {
      padding: var(--spacing-lg);
      border-bottom: 1px solid var(--border-subtle);
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .logo-icon-wrapper {
      width: 44px;
      height: 44px;
      border-radius: var(--border-radius-md);
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(239, 68, 68, 0.1));
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(249, 115, 22, 0.2);
    }

    .logo-icon {
      font-size: 1.5rem;
      width: 1.5rem;
      height: 1.5rem;
      color: #f97316;
    }

    .logo-text {
      font-size: 1.125rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      background: linear-gradient(135deg, #fafafa, #a1a1aa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .nav-section {
      padding: var(--spacing-md) var(--spacing-sm);
    }

    .nav-label {
      display: block;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.35);
      padding: 0 var(--spacing-md) var(--spacing-sm);
    }

    .content {
      background: var(--gradient-background);
      display: flex;
      flex-direction: column;
    }

    .content-wrapper {
      flex: 1;
      padding: var(--spacing-xl);
      overflow-y: auto;
    }

    .content-wrapper.mobile {
      padding: var(--spacing-md);
    }

    .mobile-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      background: rgba(0, 0, 0, 0.5);
      border-bottom: 1px solid var(--border-subtle);
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .menu-btn {
      background: rgba(255, 255, 255, 0.05);
    }

    .mobile-logo {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .mobile-logo mat-icon {
      color: #f97316;
    }

    .mobile-logo span {
      font-weight: 600;
      font-size: 1rem;
    }

    mat-nav-list {
      padding: 0;
    }

    mat-nav-list a {
      border-radius: var(--border-radius-sm);
      margin: var(--spacing-xs) 0;
      height: 48px;
      transition: all 0.2s ease;
    }

    mat-nav-list a:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    mat-nav-list a.active {
      background: rgba(249, 115, 22, 0.1);
      border: 1px solid rgba(249, 115, 22, 0.15);
    }

    mat-nav-list a.active mat-icon {
      color: #f97316;
    }

    mat-nav-list a.active span {
      color: #fafafa;
    }
  `,
})
export class MainLayout implements OnInit {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  isMobile = signal(false);

  constructor(private router: Router) {}

  ngOnInit() {
    this.checkScreenSize();
    // Close sidenav on navigation when on mobile
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        if (this.isMobile() && this.sidenav?.opened) {
          this.sidenav.close();
        }
      });
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize() {
    this.isMobile.set(window.innerWidth < 768);
  }

  onNavClick() {
    if (this.isMobile()) {
      this.sidenav.close();
    }
  }
}
