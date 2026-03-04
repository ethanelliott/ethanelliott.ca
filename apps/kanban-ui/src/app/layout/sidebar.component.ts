import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterModule, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { ProjectSummary } from '../models/project.model';
import { ProjectService } from '../services/project.service';
import { ConnectionState } from '../services/kanban-sse.service';
import { TaskState } from '../models/task.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    SelectModule,
    TooltipModule,
    TagModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sidebar-brand">
      <i class="pi pi-th-large brand-icon"></i>
      <span class="brand-text">Kanban</span>
      <span
        class="connection-badge"
        [class]="'conn-' + connectionState()"
        [pTooltip]="connectionLabel()"
        tooltipPosition="right"
      ></span>
    </div>

    <!-- Project Switcher -->
    <div class="project-section">
      <label class="section-label">Project</label>
      <p-select
        [options]="projectOptions()"
        [ngModel]="projectService.selectedProject()"
        (ngModelChange)="projectService.selectProject($event)"
        optionLabel="label"
        optionValue="value"
        placeholder="All projects"
        [showClear]="true"
        styleClass="project-select"
        appendTo="body"
      />
      @if (selectedSummary(); as s) {
      <div class="project-stats">
        @for (state of statePairs(s); track state.key) {
        <span class="stat-chip" [class]="'state-' + state.key.toLowerCase()">
          {{ state.key.replace('_', ' ') }} {{ state.count }}
        </span>
        }
      </div>
      }
    </div>

    <!-- Nav Links -->
    <nav class="nav-section">
      <a
        class="nav-link"
        routerLink="/board"
        routerLinkActive="active"
        [queryParamsHandling]="'preserve'"
      >
        <i class="pi pi-table"></i>
        <span>Board</span>
      </a>
      <a
        class="nav-link"
        routerLink="/dashboard"
        routerLinkActive="active"
        [queryParamsHandling]="'preserve'"
      >
        <i class="pi pi-chart-bar"></i>
        <span>Dashboard</span>
      </a>
    </nav>

    <!-- Bottom Links -->
    <nav class="nav-bottom">
      <a class="nav-link" routerLink="/skill" routerLinkActive="active">
        <i class="pi pi-book"></i>
        <span>Skill File</span>
      </a>
    </nav>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 0;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 52px;
      padding: 0 16px;
      flex-shrink: 0;
      border-bottom: 1px solid var(--p-surface-700);
    }

    .brand-icon {
      font-size: 1.3rem;
      color: var(--p-primary-color);
    }

    .brand-text {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--p-text-color);
      flex: 1;
    }

    /* Connection status dot */
    .connection-badge {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background-color 0.3s ease;

      &.conn-connected    { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
      &.conn-connecting   { background: #f59e0b; animation: pulse 1s infinite; }
      &.conn-disconnected { background: #ef4444; }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .project-section {
      padding: 12px;
      border-bottom: 1px solid var(--p-surface-700);
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }

    .section-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--p-text-muted-color);
    }

    :host ::ng-deep .project-select {
      width: 100%;
      font-size: 0.85rem;
    }

    .project-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .stat-chip {
      font-size: 0.68rem;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: 500;
      white-space: nowrap;
      background: var(--p-surface-800);
      color: var(--p-text-muted-color);

      &.state-in_progress { color: #a78bfa; background: #a78bfa22; }
      &.state-todo        { color: #60a5fa; background: #60a5fa22; }
      &.state-done        { color: #34d399; background: #34d39922; }
      &.state-blocked     { color: #f87171; background: #f8717122; }
      &.state-in_review   { color: #fbbf24; background: #fbbf2422; }
      &.state-backlog     { color: #94a3b8; background: #94a3b822; }
    }

    .nav-section {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
    }

    .nav-bottom {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      border-top: 1px solid var(--p-surface-700);
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
      cursor: pointer;

      &:hover {
        background: var(--p-surface-800);
        color: var(--p-text-color);
      }

      &.active {
        background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
        color: var(--p-primary-color);
      }

      i { font-size: 0.95rem; flex-shrink: 0; }
    }

    /* ── Footer ─────────────────────────────────────── */

  `,
})
export class SidebarComponent {
  readonly projectService = inject(ProjectService);

  /** Projects list passed in from the shell */
  readonly projects = input<ProjectSummary[]>([]);
  /** Current SSE connection state passed in from the shell */
  readonly connectionState = input<ConnectionState>('disconnected');

  /** Emit when the user wants to close a mobile drawer */
  readonly close = output<void>();

  readonly projectOptions = computed(() => [
    ...this.projects().map((p) => ({
      label: `${p.project} (${p.total})`,
      value: p.project,
    })),
  ]);

  readonly selectedSummary = computed(() => {
    const proj = this.projectService.selectedProject();
    if (!proj) return null;
    return this.projects().find((p) => p.project === proj) ?? null;
  });

  readonly connectionLabel = computed(() => {
    switch (this.connectionState()) {
      case 'connected':
        return '🟢 Live — receiving events';
      case 'connecting':
        return '🟡 Reconnecting…';
      default:
        return '🔴 Offline';
    }
  });

  statePairs(summary: ProjectSummary): { key: string; count: number }[] {
    return Object.entries(summary.byState)
      .filter(([, v]) => v && v > 0)
      .sort(([a], [b]) => {
        const order = Object.values(TaskState) as string[];
        return order.indexOf(a) - order.indexOf(b);
      })
      .map(([key, count]) => ({ key, count: count ?? 0 }));
  }
}
