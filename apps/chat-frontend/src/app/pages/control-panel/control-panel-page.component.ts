import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { GatewayApiService } from '../../services/gateway-api.service';
import {
  GatewayConfig,
  GatewayModelInfo,
  GatewaySubAgentDefinition,
  GatewayToolInfo,
  GatewayHealthInfo,
} from '../../models/types';

interface ModelOption {
  name: string;
  label: string;
}

@Component({
  selector: 'app-control-panel-page',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    SliderModule,
    ToggleSwitchModule,
    TooltipModule,
    TagModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="control-panel">
      <div class="panel-header">
        <div class="header-row">
          <h1>Control Panel</h1>
          <p-button
            icon="pi pi-refresh"
            label="Refresh"
            severity="secondary"
            size="small"
            [loading]="loading()"
            (click)="loadConfig()"
          />
        </div>
        <p class="header-desc">Manage your AI Gateway runtime configuration</p>
      </div>

      @if (loading() && !config()) {
      <div class="loading-state">
        <i class="pi pi-spin pi-spinner"></i>
        <span>Connecting to gateway...</span>
      </div>
      } @else if (error()) {
      <div class="error-state">
        <i class="pi pi-exclamation-triangle"></i>
        <span>{{ error() }}</span>
        <p-button
          label="Retry"
          severity="secondary"
          size="small"
          (click)="loadConfig()"
        />
      </div>
      } @else if (config()) {

      <!-- Health Status -->
      <section class="panel-section">
        <h2><i class="pi pi-heart-fill section-icon"></i> System Health</h2>
        @if (health()) {
        <div class="health-grid">
          <div class="health-card">
            <div class="health-label">Status</div>
            <p-tag
              [severity]="health()!.status === 'healthy' ? 'success' : 'warn'"
              [value]="health()!.status"
            />
          </div>
          <div class="health-card">
            <div class="health-label">Ollama</div>
            <p-tag
              [severity]="
                health()!.ollama === 'connected' ? 'success' : 'danger'
              "
              [value]="health()!.ollama"
            />
          </div>
          <div class="health-card">
            <div class="health-label">Orchestrator Model</div>
            <span class="health-value">{{
              health()!.orchestratorModel || 'default'
            }}</span>
          </div>
          <div class="health-card">
            <div class="health-label">Sub-Agents</div>
            <span class="health-value">{{ health()!.subAgentCount }}</span>
          </div>
          <div class="health-card">
            <div class="health-label">Tools</div>
            <span class="health-value">{{ health()!.toolCount }}</span>
          </div>
        </div>
        }
      </section>

      <!-- Orchestrator Config -->
      <section class="panel-section">
        <div class="section-header">
          <h2><i class="pi pi-sitemap section-icon"></i> Orchestrator</h2>
          <p-button
            icon="pi pi-save"
            label="Save"
            size="small"
            [disabled]="!orchestratorDirty()"
            (click)="saveOrchestrator()"
          />
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <label>Orchestrator Model</label>
            <span class="setting-desc"
              >LLM used for routing and delegation decisions</span
            >
          </div>
          <p-select
            [options]="modelOptions()"
            [(ngModel)]="orchModel"
            optionLabel="label"
            optionValue="name"
            placeholder="Select model"
            [showClear]="true"
            [style]="{ minWidth: '220px' }"
            size="small"
          />
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <label>Max Delegations</label>
            <span class="setting-desc"
              >Maximum times the orchestrator can delegate to sub-agents per
              request</span
            >
          </div>
          <div class="slider-group">
            <p-slider
              [(ngModel)]="orchMaxDelegations"
              [min]="1"
              [max]="20"
              [step]="1"
              [style]="{ width: '140px' }"
            />
            <span class="slider-value">{{ orchMaxDelegations() }}</span>
          </div>
        </div>
      </section>

      <!-- Sub-Agents -->
      <section class="panel-section">
        <h2><i class="pi pi-users section-icon"></i> Sub-Agents</h2>
        @for (agent of config()!.subAgents; track agent.name) {
        <div class="agent-card">
          <div class="agent-header">
            <div class="agent-header-left">
              <span class="agent-name">{{ agent.name }}</span>
              <span class="agent-desc">{{ agent.description }}</span>
            </div>
            <p-button
              icon="pi pi-save"
              size="small"
              [disabled]="!isAgentDirty(agent.name)"
              (click)="saveAgent(agent.name)"
              pTooltip="Save changes"
            />
          </div>
          <div class="agent-body">
            <div class="setting-row">
              <div class="setting-info">
                <label>Model</label>
              </div>
              <p-select
                [options]="modelOptions()"
                [ngModel]="getAgentForm(agent.name).model"
                (ngModelChange)="updateAgentForm(agent.name, 'model', $event)"
                optionLabel="label"
                optionValue="name"
                placeholder="Select model"
                [showClear]="true"
                [style]="{ minWidth: '200px' }"
                size="small"
              />
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <label>Temperature</label>
              </div>
              <div class="slider-group">
                <p-slider
                  [ngModel]="getAgentForm(agent.name).temperature"
                  (ngModelChange)="
                    updateAgentForm(agent.name, 'temperature', $event)
                  "
                  [min]="0"
                  [max]="200"
                  [step]="1"
                  [style]="{ width: '140px' }"
                />
                <span class="slider-value">{{
                  (getAgentForm(agent.name).temperature / 100).toFixed(2)
                }}</span>
              </div>
            </div>
            <div class="setting-row vertical">
              <div class="setting-info">
                <label>System Prompt</label>
              </div>
              <textarea
                pTextarea
                [ngModel]="getAgentForm(agent.name).systemPrompt"
                (ngModelChange)="
                  updateAgentForm(agent.name, 'systemPrompt', $event)
                "
                [rows]="6"
                [autoResize]="true"
                class="prompt-textarea"
              ></textarea>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <label>Assigned Tools</label>
                <span class="setting-desc">Tools this agent can use</span>
              </div>
            </div>
            <div class="tool-chips">
              @for (toolName of getAgentForm(agent.name).tools; track toolName)
              {
              <span class="tool-chip">
                <i class="pi pi-wrench"></i>
                {{ toolName }}
                <button
                  class="tool-chip-remove"
                  (click)="removeToolFromAgent(agent.name, toolName)"
                >
                  <i class="pi pi-times"></i>
                </button>
              </span>
              } @empty {
              <span class="no-tools">No tools assigned</span>
              }
            </div>
            @if (unassignedTools(agent.name).length) {
            <div class="add-tool-row">
              <p-select
                [options]="unassignedTools(agent.name)"
                [(ngModel)]="addToolSelections[agent.name]"
                optionLabel="name"
                optionValue="name"
                placeholder="Add a tool..."
                [showClear]="true"
                [style]="{ minWidth: '200px' }"
                size="small"
              />
              <p-button
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                [disabled]="!addToolSelections[agent.name]"
                (click)="addToolToAgent(agent.name)"
              />
            </div>
            }
          </div>
        </div>
        }
      </section>

      <!-- Available Tools -->
      <section class="panel-section">
        <h2><i class="pi pi-wrench section-icon"></i> Available Tools</h2>
        <p class="section-desc">
          All tools registered in the gateway. Assign tools to agents above to
          make them available during conversations.
        </p>
        @for (category of toolsByCategory(); track category.name) {
        <div class="tool-category">
          <h3 class="category-name">{{ category.name }}</h3>
          @for (tool of category.tools; track tool.name) {
          <div class="tool-row">
            <div class="tool-info">
              <span class="tool-name">{{ tool.name }}</span>
              <span class="tool-desc">{{ tool.description }}</span>
            </div>
            <div class="tool-meta">
              @if (tool.approval?.required) {
              <p-tag severity="warn" value="Approval Required" />
              } @if (tool.tags?.length) { @for (tag of tool.tags; track tag) {
              <p-tag severity="secondary" [value]="tag" />
              } }
            </div>
          </div>
          }
        </div>
        }
      </section>

      <!-- Actions -->
      <section class="panel-section">
        <h2><i class="pi pi-bolt section-icon"></i> Actions</h2>
        <div class="action-row">
          <div class="setting-info">
            <label>Reset Orchestrator State</label>
            <span class="setting-desc"
              >Clear conversation history and reset the orchestrator</span
            >
          </div>
          <p-button
            label="Reset"
            icon="pi pi-replay"
            severity="danger"
            size="small"
            [outlined]="true"
            (click)="resetOrchestrator()"
          />
        </div>
      </section>

      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .control-panel {
      max-width: 740px;
      margin: 0 auto;
      padding: 24px 24px 48px;
      overflow-y: auto;
      height: 100%;
    }

    .panel-header {
      margin-bottom: 24px;
    }

    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;

      h1 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0;
        color: var(--p-text-color);
      }
    }

    .header-desc {
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
      margin: 4px 0 0;
    }

    .loading-state,
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 24px;
      color: var(--p-text-muted-color);
      font-size: 0.95rem;
    }

    .error-state i {
      font-size: 2rem;
      color: var(--p-red-400);
    }

    .loading-state i {
      font-size: 2rem;
    }

    /* Sections */
    .panel-section {
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--p-surface-800);

      &:last-child {
        border-bottom: none;
      }

      h2 {
        font-size: 1rem;
        font-weight: 600;
        margin: 0 0 14px;
        color: var(--p-text-color);
        display: flex;
        align-items: center;
        gap: 8px;
      }
    }

    .section-icon {
      font-size: 0.9rem;
      color: var(--p-primary-color);
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;

      h2 {
        margin-bottom: 0;
      }
    }

    .section-desc {
      font-size: 0.82rem;
      color: var(--p-text-muted-color);
      margin: -8px 0 14px;
    }

    /* Health */
    .health-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .health-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 16px;
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 8px;
      min-width: 110px;
      flex: 1;
    }

    .health-label {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--p-text-muted-color);
    }

    .health-value {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--p-text-color);
    }

    /* Settings */
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      gap: 16px;

      &.vertical {
        flex-direction: column;
        align-items: stretch;
      }

      & + .setting-row {
        border-top: 1px solid var(--p-surface-800);
      }
    }

    .setting-info {
      display: flex;
      flex-direction: column;
      gap: 2px;

      label {
        font-size: 0.88rem;
        font-weight: 500;
        color: var(--p-text-color);
      }

      .setting-desc {
        font-size: 0.78rem;
        color: var(--p-text-muted-color);
      }
    }

    .slider-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .slider-value {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--p-text-color);
      min-width: 32px;
      text-align: right;
    }

    .prompt-textarea {
      width: 100%;
      font-size: 0.82rem;
      font-family: 'SF Mono', 'Fira Code', monospace;
      line-height: 1.6;
    }

    /* Agent cards */
    .agent-card {
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 10px;
      margin-bottom: 12px;
      overflow: hidden;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .agent-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--p-surface-700);
    }

    .agent-header-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .agent-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--p-text-color);
    }

    .agent-desc {
      font-size: 0.78rem;
      color: var(--p-text-muted-color);
    }

    .agent-body {
      padding: 8px 16px 16px;
    }

    /* Tool chips */
    .tool-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 4px 0 8px;
    }

    .tool-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
      color: var(--p-primary-color);
      border-radius: 16px;
      font-size: 0.78rem;
      font-weight: 500;

      i {
        font-size: 0.72rem;
      }
    }

    .tool-chip-remove {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--p-primary-color);
      opacity: 0.6;

      &:hover {
        opacity: 1;
      }

      i {
        font-size: 0.65rem;
      }
    }

    .no-tools {
      font-size: 0.8rem;
      color: var(--p-text-muted-color);
      font-style: italic;
    }

    .add-tool-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 4px;
    }

    /* Tool list */
    .tool-category {
      margin-bottom: 16px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .category-name {
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--p-text-muted-color);
      margin: 0 0 8px;
    }

    .tool-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-700);
      border-radius: 8px;
      margin-bottom: 6px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .tool-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .tool-name {
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--p-text-color);
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .tool-desc {
      font-size: 0.75rem;
      color: var(--p-text-muted-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tool-meta {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      margin-left: 12px;
    }

    /* Actions */
    .action-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      gap: 16px;
    }

    @media (max-width: 768px) {
      .control-panel {
        padding: 16px 16px 48px;
      }

      .setting-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }

      .health-grid {
        flex-direction: column;
      }

      .tool-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;

        .tool-meta {
          margin-left: 0;
        }
      }
    }
  `,
})
export class ControlPanelPageComponent implements OnInit {
  private readonly gateway = inject(GatewayApiService);
  private readonly messageService = inject(MessageService);

  readonly config = signal<GatewayConfig | null>(null);
  readonly health = signal<GatewayHealthInfo | null>(null);
  readonly models = signal<GatewayModelInfo[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Form state for orchestrator
  readonly orchModel = signal('');
  readonly orchMaxDelegations = signal(5);

  // Form state for each sub-agent (keyed by name)
  agentForms: Record<
    string,
    {
      model: string;
      systemPrompt: string;
      tools: string[];
      temperature: number;
      maxIterations: number;
    }
  > = {};

  // Snapshot of original values for dirty checking
  private orchOriginal = { model: '', maxDelegations: 5 };
  private agentOriginals: Record<string, string> = {}; // JSON snapshots

  // Tool addition selection state
  addToolSelections: Record<string, string> = {};

  readonly modelOptions = computed(() =>
    this.models().map((m) => ({
      name: m.name,
      label: `${m.name}${m.sizeGb ? ` (${m.sizeGb}GB)` : ''}${
        m.family ? ` · ${m.family}` : ''
      }`,
    }))
  );

  readonly toolsByCategory = computed(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const catMap = new Map<string, GatewayToolInfo[]>();
    for (const tool of cfg.tools) {
      const cat = tool.category || 'Uncategorized';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(tool);
    }
    return Array.from(catMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, tools]) => ({ name, tools }));
  });

  readonly orchestratorDirty = computed(() => {
    return (
      this.orchModel() !== this.orchOriginal.model ||
      this.orchMaxDelegations() !== this.orchOriginal.maxDelegations
    );
  });

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading.set(true);
    this.error.set(null);

    // Load config, models, and health in parallel
    this.gateway.getConfig().subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.initOrchestratorForm(cfg);
        this.initAgentForms(cfg);
      },
      error: (err) => {
        this.error.set(
          'Failed to connect to AI Gateway. Ensure the service is running.'
        );
        this.loading.set(false);
        console.error('Config load error:', err);
      },
    });

    this.gateway.getModels().subscribe({
      next: (res) => this.models.set(res.models),
      error: () => {}, // Non-critical
    });

    this.gateway.getHealth().subscribe({
      next: (h) => {
        this.health.set(h);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private initOrchestratorForm(cfg: GatewayConfig): void {
    this.orchModel.set(cfg.orchestrator.model || '');
    this.orchMaxDelegations.set(cfg.orchestrator.maxDelegations || 5);
    this.orchOriginal = {
      model: this.orchModel(),
      maxDelegations: this.orchMaxDelegations(),
    };
  }

  private initAgentForms(cfg: GatewayConfig): void {
    this.agentForms = {};
    this.agentOriginals = {};
    for (const sa of cfg.subAgents) {
      const form = {
        model: sa.agent.model || '',
        systemPrompt: sa.agent.systemPrompt || '',
        tools: [...(sa.agent.tools || [])],
        temperature: Math.round((sa.agent.temperature ?? 0.7) * 100),
        maxIterations: sa.agent.maxIterations || 10,
      };
      this.agentForms[sa.name] = form;
      this.agentOriginals[sa.name] = JSON.stringify(form);
    }
  }

  getAgentForm(name: string) {
    return (
      this.agentForms[name] || {
        model: '',
        systemPrompt: '',
        tools: [],
        temperature: 70,
        maxIterations: 10,
      }
    );
  }

  updateAgentForm(name: string, field: string, value: unknown): void {
    if (!this.agentForms[name]) return;
    (this.agentForms[name] as any)[field] = value;
    // Trigger change detection by reassigning
    this.agentForms = { ...this.agentForms };
  }

  isAgentDirty(name: string): boolean {
    if (!this.agentForms[name] || !this.agentOriginals[name]) return false;
    return JSON.stringify(this.agentForms[name]) !== this.agentOriginals[name];
  }

  unassignedTools(agentName: string): { name: string }[] {
    const cfg = this.config();
    if (!cfg) return [];
    const assigned = new Set(this.getAgentForm(agentName).tools);
    return cfg.tools
      .filter((t) => !assigned.has(t.name))
      .map((t) => ({ name: t.name }));
  }

  addToolToAgent(agentName: string): void {
    const toolName = this.addToolSelections[agentName];
    if (!toolName || !this.agentForms[agentName]) return;
    this.agentForms[agentName].tools = [
      ...this.agentForms[agentName].tools,
      toolName,
    ];
    this.addToolSelections[agentName] = '';
    this.agentForms = { ...this.agentForms };
  }

  removeToolFromAgent(agentName: string, toolName: string): void {
    if (!this.agentForms[agentName]) return;
    this.agentForms[agentName].tools = this.agentForms[agentName].tools.filter(
      (t) => t !== toolName
    );
    this.agentForms = { ...this.agentForms };
  }

  saveOrchestrator(): void {
    const updates: Record<string, unknown> = {};
    if (this.orchModel() !== this.orchOriginal.model) {
      updates['model'] = this.orchModel() || undefined;
    }
    if (this.orchMaxDelegations() !== this.orchOriginal.maxDelegations) {
      updates['maxDelegations'] = this.orchMaxDelegations();
    }

    this.gateway.updateOrchestrator(updates as any).subscribe({
      next: (res) => {
        this.orchOriginal = {
          model: this.orchModel(),
          maxDelegations: this.orchMaxDelegations(),
        };
        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Orchestrator configuration updated',
          life: 3000,
        });
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update orchestrator',
          life: 4000,
        });
      },
    });
  }

  saveAgent(name: string): void {
    const form = this.agentForms[name];
    if (!form) return;

    this.gateway
      .updateAgent(name, {
        model: form.model || undefined,
        systemPrompt: form.systemPrompt,
        tools: form.tools,
        temperature: form.temperature / 100,
        maxIterations: form.maxIterations,
      })
      .subscribe({
        next: () => {
          this.agentOriginals[name] = JSON.stringify(form);
          this.messageService.add({
            severity: 'success',
            summary: 'Saved',
            detail: `Agent "${name}" configuration updated`,
            life: 3000,
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: `Failed to update agent "${name}"`,
            life: 4000,
          });
        },
      });
  }

  resetOrchestrator(): void {
    this.gateway.resetOrchestrator().subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Reset',
          detail: 'Orchestrator state has been reset',
          life: 3000,
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to reset orchestrator',
          life: 4000,
        });
      },
    });
  }
}
