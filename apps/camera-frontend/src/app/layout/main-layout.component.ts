import { ChangeDetectionStrategy, Component } from '@angular/core';
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
    <div class="layout">
      <mat-toolbar class="toolbar">
        <mat-icon class="toolbar-icon">videocam</mat-icon>
        <span class="toolbar-title">Camera Dashboard</span>
        <span class="spacer"></span>
        <nav class="nav-links">
          <a mat-button routerLink="/dashboard" routerLinkActive="active-link">
            <mat-icon>dashboard</mat-icon>
            Dashboard
          </a>
          <a mat-button routerLink="/events" routerLinkActive="active-link">
            <mat-icon>notifications</mat-icon>
            Events
          </a>
          <a mat-button routerLink="/archive" routerLinkActive="active-link">
            <mat-icon>photo_library</mat-icon>
            Archive
          </a>
        </nav>
      </mat-toolbar>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    .layout {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .toolbar {
      background: var(--bg-secondary) !important;
      border-bottom: 1px solid var(--border-color);
      color: var(--text-primary) !important;
      z-index: 100;
    }

    .toolbar-icon {
      margin-right: 8px;
      color: var(--accent-blue);
    }

    .toolbar-title {
      font-weight: 600;
      font-size: 18px;
    }

    .spacer {
      flex: 1;
    }

    .nav-links {
      display: flex;
      gap: 4px;

      a {
        color: var(--text-secondary) !important;
        font-size: 13px;

        mat-icon {
          margin-right: 4px;
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .active-link {
        color: var(--accent-blue) !important;
        background: rgba(59, 130, 246, 0.1);
      }
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }
  `,
})
export class MainLayoutComponent {}
