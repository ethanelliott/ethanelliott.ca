import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';

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
      <mat-sidenav #sidenav mode="side" opened class="sidenav">
        <div class="sidenav-header">
          <mat-icon class="logo-icon">restaurant_menu</mat-icon>
          <span class="logo-text">Recipe Book</span>
        </div>
        <mat-nav-list>
          <a mat-list-item routerLink="/recipes" routerLinkActive="active">
            <mat-icon matListItemIcon>menu_book</mat-icon>
            <span matListItemTitle>Recipes</span>
          </a>
          <a mat-list-item routerLink="/random" routerLinkActive="active">
            <mat-icon matListItemIcon>casino</mat-icon>
            <span matListItemTitle>Random Recipe</span>
          </a>
          <a mat-list-item routerLink="/grocery-list" routerLinkActive="active">
            <mat-icon matListItemIcon>shopping_cart</mat-icon>
            <span matListItemTitle>Grocery List</span>
          </a>
          <mat-divider></mat-divider>
          <a mat-list-item routerLink="/categories" routerLinkActive="active">
            <mat-icon matListItemIcon>category</mat-icon>
            <span matListItemTitle>Categories</span>
          </a>
          <a mat-list-item routerLink="/tags" routerLinkActive="active">
            <mat-icon matListItemIcon>label</mat-icon>
            <span matListItemTitle>Tags</span>
          </a>
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content class="content">
        <router-outlet />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .sidenav-container {
      height: 100vh;
    }

    .sidenav {
      width: 260px;
      background: var(--bg-card);
      border-right: 1px solid var(--border-subtle);
    }

    .sidenav-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-lg);
      border-bottom: 1px solid var(--border-subtle);
    }

    .logo-icon {
      font-size: 2rem;
      width: 2rem;
      height: 2rem;
      color: var(--mat-sys-primary);
    }

    .logo-text {
      font-size: 1.25rem;
      font-weight: 500;
    }

    .content {
      background: var(--bg-base);
      padding: var(--spacing-lg);
    }

    mat-nav-list {
      padding-top: var(--spacing-md);
    }

    .active {
      background: var(--bg-muted) !important;
    }

    mat-divider {
      margin: var(--spacing-md) 0;
    }
  `,
})
export class MainLayout {}
