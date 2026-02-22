import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule, RouterLink, RouterLinkActive } from '@angular/router';
import { Toolbar } from 'primeng/toolbar';
import { ButtonDirective } from 'primeng/button';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterModule,
    RouterLink,
    RouterLinkActive,
    Toolbar,
    ButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <p-toolbar styleClass="toolbar">
        <ng-template #start>
          <i class="pi pi-video toolbar-icon"></i>
          <span class="toolbar-title">Camera Dashboard</span>
        </ng-template>
        <ng-template #end>
          <nav class="nav-links">
            <a
              pButton
              [text]="true"
              routerLink="/dashboard"
              routerLinkActive="active-link"
            >
              <i class="pi pi-objects-column"></i>
              Dashboard
            </a>
            <a
              pButton
              [text]="true"
              routerLink="/events"
              routerLinkActive="active-link"
            >
              <i class="pi pi-bell"></i>
              Events
            </a>
            <a
              pButton
              [text]="true"
              routerLink="/archive"
              routerLinkActive="active-link"
            >
              <i class="pi pi-images"></i>
              Archive
            </a>
          </nav>
        </ng-template>
      </p-toolbar>

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

    :host ::ng-deep .toolbar {
      background: var(--bg-secondary) !important;
      border-bottom: 1px solid var(--border-color);
      border-radius: 0;
      color: var(--text-primary) !important;
      z-index: 100;
      padding: 0.5rem 1rem;
    }

    .toolbar-icon {
      margin-right: 8px;
      color: var(--accent-blue);
      font-size: 1.25rem;
    }

    .toolbar-title {
      font-weight: 600;
      font-size: 18px;
    }

    .nav-links {
      display: flex;
      gap: 4px;

      a {
        color: var(--text-secondary) !important;
        font-size: 13px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        text-decoration: none;

        i {
          font-size: 16px;
        }
      }

      .active-link {
        color: var(--accent-blue) !important;
        background: rgba(59, 130, 246, 0.1);
        border-radius: var(--radius-sm);
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
