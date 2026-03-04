import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  effect,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DrawerModule } from 'primeng/drawer';
import { KanbanApiService } from '../services/kanban-api.service';
import { KanbanSseService, ConnectionState } from '../services/kanban-sse.service';
import { ProjectService } from '../services/project.service';
import { ProjectSummary } from '../models/project.model';
import { SidebarComponent } from './sidebar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    DrawerModule,
    SidebarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Mobile header (visible on small viewports only) -->
    <header class="mobile-header">
      <button
        class="hamburger"
        type="button"
        (click)="drawerOpen.set(true)"
        aria-label="Open sidebar"
      >
        <i class="pi pi-bars"></i>
      </button>
      <span class="mobile-brand">
        <i class="pi pi-th-large"></i>
        Kanban
      </span>
      <span
        class="mobile-conn"
        [class]="'conn-' + connectionState()"
      ></span>
    </header>

    <!-- Mobile drawer -->
    <p-drawer
      [(visible)]="drawerOpenValue"
      position="left"
      styleClass="sidebar-drawer"
    >
      <app-sidebar
        [projects]="projects()"
        [connectionState]="connectionState()"
        (close)="drawerOpen.set(false)"
      />
    </p-drawer>

    <!-- Desktop layout -->
    <div class="shell-layout">
      <!-- Fixed desktop sidebar -->
      <aside class="desktop-sidebar">
        <app-sidebar
          [projects]="projects()"
          [connectionState]="connectionState()"
        />
      </aside>

      <!-- Main content -->
      <main class="shell-main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100dvh;
      overflow: hidden;
    }

    /* ── Mobile header ───────────────────────────────────── */
    .mobile-header {
      display: none;
      align-items: center;
      gap: 10px;
      height: 52px;
      padding: 0 12px;
      border-bottom: 1px solid var(--p-surface-700);
      background: var(--p-surface-900);
      flex-shrink: 0;
    }

    .hamburger {
      background: transparent;
      border: none;
      color: var(--p-text-color);
      cursor: pointer;
      padding: 6px;
      font-size: 1.1rem;
    }

    .mobile-brand {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      color: var(--p-text-color);
    }

    .mobile-conn {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .mobile-conn.conn-connected    { background: #22c55e; }
    .mobile-conn.conn-connecting   { background: #f59e0b; }
    .mobile-conn.conn-disconnected { background: #ef4444; }

    /* ── Shell layout ────────────────────────────────────── */
    .shell-layout {
      display: flex;
      height: 100dvh;
    }

    .desktop-sidebar {
      width: 260px;
      flex-shrink: 0;
      background: var(--p-surface-900);
      border-right: 1px solid var(--p-surface-700);
      overflow-y: auto;
    }

    .shell-main {
      flex: 1;
      overflow: auto;
      background: var(--p-surface-950, var(--p-surface-900));
    }

    /* Drawer overrides */
    :host ::ng-deep .sidebar-drawer .p-drawer-header {
      display: none;
    }
    :host ::ng-deep .sidebar-drawer .p-drawer-content {
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* ── Mobile breakpoint ───────────────────────────────── */
    @media (max-width: 768px) {
      .mobile-header {
        display: flex;
      }

      .shell-layout {
        height: calc(100dvh - 52px);
        display: block;
      }

      .desktop-sidebar {
        display: none;
      }
    }
  `,
})
export class ShellComponent implements OnInit, OnDestroy {
  private readonly api = inject(KanbanApiService);
  readonly sse = inject(KanbanSseService);
  readonly projectService = inject(ProjectService);

  readonly projects = signal<ProjectSummary[]>([]);
  readonly connectionState = signal<ConnectionState>('disconnected');
  readonly drawerOpen = signal(false);

  /** Two-way binding shim for p-drawer [(visible)] */
  get drawerOpenValue(): boolean {
    return this.drawerOpen();
  }
  set drawerOpenValue(v: boolean) {
    this.drawerOpen.set(v);
  }

  constructor() {
    // Mirror SSE connection state into local signal
    this.sse.connectionState$.subscribe((s) => this.connectionState.set(s));

    // Reconnect SSE whenever the selected project changes
    effect(() => {
      const project = this.projectService.selectedProject();
      this.sse.connect(project);
    });
  }

  ngOnInit(): void {
    this.api.listProjects().subscribe({
      next: (list) => this.projects.set(list),
      error: (err) => console.error('[ShellComponent] listProjects error', err),
    });
  }

  ngOnDestroy(): void {
    this.sse.disconnect();
  }
}
