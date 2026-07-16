import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { WorkflowApiService } from '../../services/workflow-api.service';
import { WorkflowSummary } from '../../models/workflow.types';

@Component({
  selector: 'app-workflows-page',
  standalone: true,
  imports: [FormsModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="workflows-page">
      <div class="page-header">
        <div class="header-main">
          <h1>Workflows</h1>
          <p class="header-sub">
            Automate multi-step tasks with your tools, models, and agents
          </p>
        </div>
        <button class="primary-btn" (click)="creating.set(true)">
          <i class="pi pi-plus"></i>
          New workflow
        </button>
      </div>

      @if (creating()) {
      <div class="create-card">
        <input
          pInputText
          [(ngModel)]="newName"
          placeholder="Workflow name (e.g. Morning brief)"
          class="create-input"
          (keydown.enter)="createWorkflow()"
          (keydown.escape)="creating.set(false)"
        />
        <button
          class="primary-btn"
          [disabled]="!newName.trim() || busy()"
          (click)="createWorkflow()"
        >
          Create
        </button>
        <button class="ghost-btn" (click)="creating.set(false)">Cancel</button>
      </div>
      }

      @if (unavailable()) {
      <div class="empty-state">
        <i class="pi pi-database"></i>
        <h3>Workflow persistence unavailable</h3>
        <p>
          The gateway can't reach its Postgres database. Check the DB_* env
          configuration and the db-init job.
        </p>
      </div>
      } @else if (loaded() && workflows().length === 0 && !creating()) {
      <div class="empty-state">
        <i class="pi pi-sitemap"></i>
        <h3>No workflows yet</h3>
        <p>
          Build a graph of steps — call tools, prompt models, branch on
          conditions — then run it on demand.
        </p>
        <button class="primary-btn" (click)="creating.set(true)">
          <i class="pi pi-plus"></i>
          Create your first workflow
        </button>
      </div>
      } @else {
      <div class="workflow-grid">
        @for (wf of workflows(); track wf.id) {
        <div class="workflow-card" (click)="open(wf.id)">
          <div class="card-head">
            <span class="card-name">{{ wf.name }}</span>
            @if (!wf.enabled) {
            <span class="badge muted">disabled</span>
            }
          </div>
          @if (wf.description) {
          <p class="card-desc">{{ wf.description }}</p>
          }
          <div class="card-meta">
            <span
              ><i class="pi pi-circle-fill node-dot"></i
              >{{ wf.nodeCount }} steps</span
            >
            @if (wf.cron && wf.enabled) {
            <span class="cron-chip" [title]="'cron: ' + wf.cron">
              <i class="pi pi-clock"></i>
              {{ nextRunLabel(wf.nextRunAt) }}
            </span>
            }
            @if (wf.lastRun) {
            <span
              class="run-pill"
              [class.ok]="wf.lastRun.status === 'succeeded'"
              [class.bad]="wf.lastRun.status === 'failed'"
              [class.busy]="wf.lastRun.status === 'running'"
            >
              {{ wf.lastRun.status }}
            </span>
            } @else {
            <span class="run-pill muted">never run</span>
            }
          </div>
          <div class="card-actions" (click)="$event.stopPropagation()">
            <button
              class="icon-btn"
              title="Run now"
              [disabled]="!wf.enabled"
              (click)="runNow(wf)"
            >
              <i class="pi pi-play"></i>
            </button>
            <button class="icon-btn danger" title="Delete" (click)="remove(wf)">
              <i class="pi pi-trash"></i>
            </button>
          </div>
        </div>
        }
      </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(
          ellipse 60% 40% at 50% -10%,
          color-mix(in srgb, var(--p-primary-500) 6%, transparent),
          transparent
        ),
        var(--p-surface-950);
    }

    .workflows-page {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px;
      height: 100%;
      overflow-y: auto;
      box-sizing: border-box;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;

      h1 {
        font-size: 1.4rem;
        font-weight: 750;
        letter-spacing: -0.02em;
        margin: 0;
        color: var(--p-text-color);
      }
    }

    .header-sub {
      font-size: 0.82rem;
      color: var(--p-text-muted-color);
      margin: 4px 0 0;
    }

    .primary-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: none;
      border-radius: 10px;
      background: var(--chat-gradient);
      color: white;
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 9px 16px;
      cursor: pointer;
      transition: filter 0.15s ease;
      flex-shrink: 0;

      i { font-size: 0.75rem; }

      &:hover:not(:disabled) { filter: brightness(1.12); }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    .ghost-btn {
      border: 1px solid var(--p-surface-700);
      border-radius: 10px;
      background: none;
      color: var(--p-text-muted-color);
      font-family: inherit;
      font-size: 0.82rem;
      padding: 9px 14px;
      cursor: pointer;

      &:hover { color: var(--p-text-color); }
    }

    .create-card {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
      border: 1px solid var(--p-surface-800);
      border-radius: var(--chat-radius-md);
      padding: 12px;
    }

    .create-input {
      flex: 1;
      background: var(--p-surface-950) !important;
      border-color: var(--p-surface-700) !important;
      border-radius: 9px !important;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      padding: 64px 24px;
      color: var(--p-text-muted-color);

      i { font-size: 2rem; opacity: 0.5; }

      h3 {
        margin: 8px 0 0;
        color: var(--p-text-color);
        font-size: 1.05rem;
      }

      p {
        margin: 0 0 12px;
        font-size: 0.85rem;
        max-width: 420px;
      }
    }

    .workflow-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }

    .workflow-card {
      position: relative;
      background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
      border: 1px solid var(--p-surface-800);
      border-radius: var(--chat-radius-md);
      padding: 16px;
      cursor: pointer;
      transition: border-color 0.15s ease;

      &:hover {
        border-color: var(--chat-accent);

        .card-actions { opacity: 1; }
      }
    }

    .card-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-name {
      font-size: 0.95rem;
      font-weight: 650;
      letter-spacing: -0.01em;
      color: var(--p-text-color);
    }

    .card-desc {
      font-size: 0.76rem;
      color: var(--p-text-muted-color);
      margin: 6px 0 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
      font-size: 0.72rem;
      color: var(--p-text-muted-color);

      .node-dot {
        font-size: 0.4rem;
        color: var(--chat-accent);
        margin-right: 5px;
      }
    }

    .cron-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--chat-font-mono);
      font-size: 0.62rem;
      color: var(--chat-accent);
      border: 1px solid color-mix(in srgb, var(--p-primary-500) 35%, transparent);
      border-radius: 999px;
      padding: 2px 8px;

      i { font-size: 0.58rem; }
    }

    .run-pill {
      font-family: var(--chat-font-mono);
      font-size: 0.62rem;
      font-weight: 600;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid var(--p-surface-700);

      &.ok { color: #34d399; border-color: color-mix(in srgb, #34d399 40%, transparent); }
      &.bad { color: #f87171; border-color: color-mix(in srgb, #f87171 40%, transparent); }
      &.busy { color: var(--chat-accent); border-color: color-mix(in srgb, var(--p-primary-500) 40%, transparent); }
      &.muted { opacity: 0.7; }
    }

    .badge.muted {
      font-size: 0.62rem;
      color: var(--p-text-muted-color);
      border: 1px solid var(--p-surface-700);
      border-radius: 999px;
      padding: 1px 8px;
    }

    .card-actions {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 1px solid var(--p-surface-700);
      border-radius: 8px;
      background: var(--p-surface-900);
      color: var(--p-text-muted-color);
      cursor: pointer;

      i { font-size: 0.72rem; }

      &:hover:not(:disabled) { color: var(--p-text-color); border-color: var(--p-surface-500); }
      &.danger:hover { color: #f87171; }
      &:disabled { opacity: 0.4; cursor: default; }
    }
  `,
})
export class WorkflowsPageComponent implements OnInit {
  private readonly api = inject(WorkflowApiService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  readonly workflows = signal<WorkflowSummary[]>([]);
  readonly loaded = signal(false);
  readonly unavailable = signal(false);
  readonly creating = signal(false);
  readonly busy = signal(false);
  newName = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.list().subscribe({
      next: (res) => {
        this.workflows.set(res.workflows);
        this.loaded.set(true);
        this.unavailable.set(false);
      },
      error: (err) => {
        this.loaded.set(true);
        if (err?.status === 503) this.unavailable.set(true);
      },
    });
  }

  createWorkflow(): void {
    const name = this.newName.trim();
    if (!name) return;
    this.busy.set(true);
    // Every workflow starts with a trigger node
    this.api
      .create({
        name,
        graph: {
          nodes: [
            {
              id: 'trigger',
              kind: 'manual_trigger',
              label: 'Start',
              config: {},
              position: { x: 80, y: 200 },
            },
          ],
          edges: [],
        },
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.newName = '';
          this.creating.set(false);
          this.router.navigate(['/workflows', res.workflow.id]);
        },
        error: (err) => {
          this.busy.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Create failed',
            detail: err?.error?.error || 'Could not create workflow',
            life: 4000,
          });
        },
      });
  }

  open(id: string): void {
    this.router.navigate(['/workflows', id]);
  }

  runNow(wf: WorkflowSummary): void {
    this.api.run(wf.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Run started',
          detail: `"${wf.name}" is running`,
          life: 3000,
        });
        setTimeout(() => this.load(), 1500);
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Run failed to start',
          detail: err?.error?.error || 'Unknown error',
          life: 4000,
        });
      },
    });
  }

  nextRunLabel(nextRunAt: string | null): string {
    if (!nextRunAt) return 'scheduled';
    const diffMs = new Date(nextRunAt).getTime() - Date.now();
    if (diffMs <= 0) return 'due now';
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `in ${hours}h`;
    return `in ${Math.round(hours / 24)}d`;
  }

  remove(wf: WorkflowSummary): void {
    this.api.delete(wf.id).subscribe({
      next: () => this.load(),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Delete failed',
          life: 3000,
        });
      },
    });
  }
}
