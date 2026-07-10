import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { MessageService } from 'primeng/api';
import { GatewayApiService } from '../../services/gateway-api.service';
import {
  GatewayConfig,
  GatewayModelInfo,
  GatewayToolInfo,
  GatewayHealthInfo,
} from '../../models/types';

type PanelTab = 'overview' | 'orchestrator' | 'agents' | 'tools';

interface AgentForm {
  model: string;
  systemPrompt: string;
  tools: string[];
  temperature: number; // 0–200 (slider), maps to 0.00–2.00
  maxIterations: number;
}

@Component({
  selector: 'app-control-panel-page',
  standalone: true,
  imports: [
    FormsModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    SliderModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="control-panel">
      <!-- ─── Header ─── -->
      <div class="panel-header">
        <div class="header-main">
          <h1>Control Panel</h1>
          @if (health(); as h) {
          <div class="health-pills">
            <span
              class="health-pill"
              [class.ok]="h.status === 'healthy'"
              [class.warn]="h.status !== 'healthy'"
            >
              <span class="pill-dot"></span>
              {{ h.status }}
            </span>
            <span
              class="health-pill"
              [class.ok]="h.ollama === 'connected'"
              [class.bad]="h.ollama !== 'connected'"
            >
              <span class="pill-dot"></span>
              ollama
            </span>
          </div>
          }
        </div>
        <button class="refresh-btn" [disabled]="loading()" (click)="loadConfig()">
          <i class="pi" [class.pi-refresh]="!loading()" [class.pi-spin]="loading()" [class.pi-spinner]="loading()"></i>
          Refresh
        </button>
      </div>

      <!-- ─── Tabs ─── -->
      <div class="tab-bar">
        @for (tab of tabs; track tab.id) {
        <button
          class="tab"
          [class.active]="activeTab() === tab.id"
          (click)="activeTab.set(tab.id)"
        >
          <i class="pi" [class]="'pi ' + tab.icon"></i>
          {{ tab.label }}
          @if (tab.id === 'agents' && dirtyAgentCount() > 0) {
          <span class="tab-badge">{{ dirtyAgentCount() }}</span>
          } @if (tab.id === 'orchestrator' && orchestratorDirty()) {
          <span class="tab-badge dot"></span>
          }
        </button>
        }
      </div>

      @if (loading() && !config()) {
      <div class="empty-panel">
        <i class="pi pi-spin pi-spinner"></i>
        <span>Connecting to gateway…</span>
      </div>
      } @else if (error()) {
      <div class="empty-panel">
        <i class="pi pi-exclamation-triangle error-icon"></i>
        <span>{{ error() }}</span>
        <button class="refresh-btn" (click)="loadConfig()">Retry</button>
      </div>
      } @else if (config()) {

      <div class="tab-content">
        <!-- ═══ OVERVIEW ═══ -->
        @if (activeTab() === 'overview') {
        <div class="stat-grid">
          <div class="stat-tile">
            <div class="stat-label">Gateway</div>
            <div class="stat-value" [class.ok-text]="health()?.status === 'healthy'">
              {{ health()?.status || 'unknown' }}
            </div>
            <i class="pi pi-server stat-icon"></i>
          </div>
          <div class="stat-tile">
            <div class="stat-label">Ollama</div>
            <div
              class="stat-value"
              [class.ok-text]="health()?.ollama === 'connected'"
              [class.bad-text]="health()?.ollama === 'disconnected'"
            >
              {{ health()?.ollama || 'unknown' }}
            </div>
            <i class="pi pi-microchip stat-icon"></i>
          </div>
          <div class="stat-tile">
            <div class="stat-label">Orchestrator model</div>
            <div class="stat-value mono">
              {{ health()?.orchestratorModel || 'default' }}
            </div>
            <i class="pi pi-sitemap stat-icon"></i>
          </div>
          <div class="stat-tile clickable" (click)="activeTab.set('agents')">
            <div class="stat-label">Sub-agents</div>
            <div class="stat-value">{{ health()?.subAgentCount ?? config()!.subAgents.length }}</div>
            <i class="pi pi-users stat-icon"></i>
          </div>
          <div class="stat-tile clickable" (click)="activeTab.set('tools')">
            <div class="stat-label">Tools</div>
            <div class="stat-value">{{ health()?.toolCount ?? config()!.tools.length }}</div>
            <i class="pi pi-wrench stat-icon"></i>
          </div>
          <div class="stat-tile">
            <div class="stat-label">Models available</div>
            <div class="stat-value">{{ models().length }}</div>
            <i class="pi pi-box stat-icon"></i>
          </div>
        </div>

        <div class="danger-card">
          <div class="danger-info">
            <span class="danger-title">Reset orchestrator state</span>
            <span class="danger-desc"
              >Clears the default orchestrator's conversation history. Does not
              change any configuration.</span
            >
          </div>
          <button class="danger-btn" (click)="resetOrchestrator()">
            <i class="pi pi-replay"></i>
            Reset
          </button>
        </div>
        }

        <!-- ═══ ORCHESTRATOR ═══ -->
        @if (activeTab() === 'orchestrator') {
        <div class="editor-card">
          <div class="editor-header">
            <div class="editor-title">
              <i class="pi pi-sitemap"></i>
              <span>Routing &amp; delegation</span>
            </div>
            <button
              class="save-btn"
              [disabled]="!orchestratorDirty()"
              (click)="saveOrchestrator()"
            >
              <i class="pi pi-check"></i>
              Save
            </button>
          </div>

          <div class="field-row">
            <div class="field-info">
              <label>Model</label>
              <span class="field-desc"
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
              [style]="{ minWidth: '230px' }"
              size="small"
            />
          </div>

          <div class="field-row">
            <div class="field-info">
              <label>Max delegations</label>
              <span class="field-desc"
                >How many times a single request may be handed to
                sub-agents</span
              >
            </div>
            <div class="slider-group">
              <p-slider
                [(ngModel)]="orchMaxDelegations"
                [min]="1"
                [max]="20"
                [step]="1"
                [style]="{ width: '150px' }"
              />
              <span class="slider-value">{{ orchMaxDelegations() }}</span>
            </div>
          </div>

          <div class="field-row vertical">
            <div class="field-info">
              <label>System prompt</label>
              <span class="field-desc"
                >Controls routing behaviour. Leave empty to use the built-in
                default.</span
              >
            </div>
            <textarea
              pTextarea
              [(ngModel)]="orchSystemPrompt"
              [rows]="10"
              [autoResize]="true"
              class="prompt-textarea"
              placeholder="Leave empty to use the default orchestrator prompt…"
            ></textarea>
          </div>
        </div>
        }

        <!-- ═══ AGENTS ═══ -->
        @if (activeTab() === 'agents') {
        <div class="agents-layout" [class.detail-open]="selectedAgent()">
          <!-- Agent list rail -->
          <div class="agent-rail">
            <div class="rail-search">
              <i class="pi pi-search"></i>
              <input
                pInputText
                [(ngModel)]="agentSearch"
                placeholder="Filter agents…"
              />
            </div>
            <div class="agent-list">
              @for (agent of filteredAgents(); track agent.name) {
              <button
                class="agent-item"
                [class.active]="selectedAgent() === agent.name"
                (click)="selectAgent(agent.name)"
              >
                <div class="agent-item-top">
                  <span class="agent-item-name">{{ agent.name }}</span>
                  @if (isAgentDirty(agent.name)) {
                  <span class="dirty-dot" title="Unsaved changes"></span>
                  }
                </div>
                <div class="agent-item-meta">
                  <span class="mono">{{
                    getAgentForm(agent.name).model || 'default'
                  }}</span>
                  <span>·</span>
                  <span>{{ getAgentForm(agent.name).tools.length }} tools</span>
                </div>
              </button>
              } @empty {
              <div class="rail-empty">No matching agents</div>
              }
            </div>
          </div>

          <!-- Agent editor -->
          <div class="agent-editor">
            @if (selectedAgentDef(); as agent) {
            <div class="editor-card">
              <div class="editor-header">
                <div class="editor-title">
                  <button class="back-btn" (click)="selectedAgent.set(null)">
                    <i class="pi pi-arrow-left"></i>
                  </button>
                  <i class="pi pi-user"></i>
                  <div class="editor-title-text">
                    <span>{{ agent.name }}</span>
                    <span class="editor-subtitle">{{ agent.description }}</span>
                  </div>
                </div>
                <button
                  class="save-btn"
                  [disabled]="!isAgentDirty(agent.name)"
                  (click)="saveAgent(agent.name)"
                >
                  <i class="pi pi-check"></i>
                  Save
                </button>
              </div>

              <div class="field-row">
                <div class="field-info">
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
                  [style]="{ minWidth: '230px' }"
                  size="small"
                />
              </div>

              <div class="field-row">
                <div class="field-info">
                  <label>Temperature</label>
                  <span class="field-desc">Higher = more creative</span>
                </div>
                <div class="slider-group">
                  <p-slider
                    [ngModel]="getAgentForm(agent.name).temperature"
                    (ngModelChange)="
                      updateAgentForm(agent.name, 'temperature', $event)
                    "
                    [min]="0"
                    [max]="200"
                    [step]="5"
                    [style]="{ width: '150px' }"
                  />
                  <span class="slider-value">{{
                    (getAgentForm(agent.name).temperature / 100).toFixed(2)
                  }}</span>
                </div>
              </div>

              <div class="field-row">
                <div class="field-info">
                  <label>Max iterations</label>
                  <span class="field-desc"
                    >Tool-call loop limit per task</span
                  >
                </div>
                <div class="slider-group">
                  <p-slider
                    [ngModel]="getAgentForm(agent.name).maxIterations"
                    (ngModelChange)="
                      updateAgentForm(agent.name, 'maxIterations', $event)
                    "
                    [min]="1"
                    [max]="20"
                    [step]="1"
                    [style]="{ width: '150px' }"
                  />
                  <span class="slider-value">{{
                    getAgentForm(agent.name).maxIterations
                  }}</span>
                </div>
              </div>

              <div class="field-row vertical">
                <div class="field-info">
                  <label>System prompt</label>
                </div>
                <textarea
                  pTextarea
                  [ngModel]="getAgentForm(agent.name).systemPrompt"
                  (ngModelChange)="
                    updateAgentForm(agent.name, 'systemPrompt', $event)
                  "
                  [rows]="8"
                  [autoResize]="true"
                  class="prompt-textarea"
                ></textarea>
              </div>

              <div class="field-row vertical">
                <div class="field-info">
                  <label>Tools ({{ getAgentForm(agent.name).tools.length }})</label>
                  <span class="field-desc">What this agent can call</span>
                </div>
                <div class="tool-chips">
                  @for (toolName of getAgentForm(agent.name).tools; track
                  toolName) {
                  <span class="tool-chip">
                    {{ toolName }}
                    <button
                      class="tool-chip-remove"
                      (click)="removeToolFromAgent(agent.name, toolName)"
                      title="Remove tool"
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
                    placeholder="Add a tool…"
                    [showClear]="true"
                    [filter]="true"
                    [style]="{ minWidth: '230px' }"
                    size="small"
                  />
                  <button
                    class="save-btn secondary"
                    [disabled]="!addToolSelections[agent.name]"
                    (click)="addToolToAgent(agent.name)"
                  >
                    <i class="pi pi-plus"></i>
                    Add
                  </button>
                </div>
                }
              </div>
            </div>
            } @else {
            <div class="empty-panel subtle">
              <i class="pi pi-users"></i>
              <span>Select an agent to configure it</span>
            </div>
            }
          </div>
        </div>
        }

        <!-- ═══ TOOLS ═══ -->
        @if (activeTab() === 'tools') {
        <div class="tools-controls">
          <div class="rail-search wide">
            <i class="pi pi-search"></i>
            <input
              pInputText
              [(ngModel)]="toolSearch"
              placeholder="Search {{ config()!.tools.length }} tools…"
            />
          </div>
          <div class="category-chips">
            <button
              class="category-chip"
              [class.active]="toolCategoryFilter() === null"
              (click)="toolCategoryFilter.set(null)"
            >
              All
            </button>
            @for (cat of toolCategories(); track cat) {
            <button
              class="category-chip"
              [class.active]="toolCategoryFilter() === cat"
              (click)="toolCategoryFilter.set(cat)"
            >
              {{ cat }}
            </button>
            }
          </div>
        </div>

        <div class="tool-table">
          @for (tool of filteredTools(); track tool.name) {
          <div class="tool-row">
            <div class="tool-main">
              <div class="tool-name-row">
                <span class="tool-name">{{ tool.name }}</span>
                @if (tool.approval?.required) {
                <span class="badge warn" title="Requires user approval">
                  <i class="pi pi-shield"></i> approval
                </span>
                }
                <span class="badge muted">{{ tool.category || 'other' }}</span>
              </div>
              <span class="tool-desc">{{ tool.description }}</span>
            </div>
            <div class="tool-agents">
              @for (agentName of agentsUsingTool(tool.name); track agentName) {
              <button
                class="agent-link"
                (click)="openAgent(agentName)"
                title="Configure {{ agentName }}"
              >
                {{ shortAgentName(agentName) }}
              </button>
              } @empty {
              <span class="unused">unused</span>
              }
            </div>
          </div>
          } @empty {
          <div class="empty-panel subtle">
            <i class="pi pi-search"></i>
            <span>No tools match your search</span>
          </div>
          }
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

    .control-panel {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 24px 48px;
      overflow-y: auto;
      height: 100%;
      box-sizing: border-box;
    }

    /* ─── Header ─── */
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }

    .header-main {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;

      h1 {
        font-size: 1.4rem;
        font-weight: 750;
        letter-spacing: -0.02em;
        margin: 0;
        color: var(--p-text-color);
      }
    }

    .health-pills {
      display: flex;
      gap: 6px;
    }

    .health-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--chat-font-mono);
      font-size: 0.66rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--p-text-muted-color);
      border: 1px solid var(--p-surface-800);
      border-radius: 999px;
      padding: 4px 10px;

      .pill-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--p-text-muted-color);
      }

      &.ok .pill-dot { background: #34d399; box-shadow: 0 0 6px #34d39988; }
      &.warn .pill-dot { background: #fbbf24; box-shadow: 0 0 6px #fbbf2488; }
      &.bad .pill-dot { background: #f87171; box-shadow: 0 0 6px #f8717188; }
    }

    .refresh-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid var(--p-surface-700);
      border-radius: 9px;
      background: none;
      color: var(--p-text-muted-color);
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 500;
      padding: 7px 12px;
      cursor: pointer;
      transition: color 0.15s ease, border-color 0.15s ease;

      i { font-size: 0.75rem; }

      &:hover:not(:disabled) {
        color: var(--p-text-color);
        border-color: var(--p-surface-500);
      }

      &:disabled { opacity: 0.5; cursor: default; }
    }

    /* ─── Tabs ─── */
    .tab-bar {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid var(--p-surface-800);
      margin-bottom: 20px;
      overflow-x: auto;
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--p-text-muted-color);
      font-family: inherit;
      font-size: 0.84rem;
      font-weight: 550;
      padding: 9px 14px;
      cursor: pointer;
      transition: color 0.15s ease;
      white-space: nowrap;
      margin-bottom: -1px;

      i { font-size: 0.8rem; }

      &:hover { color: var(--p-text-color); }

      &.active {
        color: var(--chat-accent);
        border-bottom-color: var(--chat-accent);
      }
    }

    .tab-badge {
      font-family: var(--chat-font-mono);
      font-size: 0.62rem;
      font-weight: 700;
      background: var(--chat-gradient);
      color: white;
      border-radius: 999px;
      padding: 1px 6px;
      min-width: 10px;
      text-align: center;

      &.dot {
        width: 7px;
        height: 7px;
        min-width: 0;
        padding: 0;
      }
    }

    /* ─── Empty / loading ─── */
    .empty-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 56px 24px;
      color: var(--p-text-muted-color);
      font-size: 0.9rem;

      i { font-size: 1.8rem; opacity: 0.6; }

      .error-icon { color: #f87171; opacity: 1; }

      &.subtle {
        padding: 40px 20px;
        i { font-size: 1.4rem; }
      }
    }

    /* ─── Overview ─── */
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }

    .stat-tile {
      position: relative;
      background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
      border: 1px solid var(--p-surface-800);
      border-radius: var(--chat-radius-md);
      padding: 16px;
      overflow: hidden;

      &.clickable {
        cursor: pointer;
        transition: border-color 0.15s ease;

        &:hover { border-color: var(--chat-accent); }
      }
    }

    .stat-label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--p-text-muted-color);
      margin-bottom: 6px;
    }

    .stat-value {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--p-text-color);

      &.mono {
        font-family: var(--chat-font-mono);
        font-size: 0.95rem;
        font-weight: 600;
      }

      &.ok-text { color: #34d399; }
      &.bad-text { color: #f87171; }
    }

    .stat-icon {
      position: absolute;
      top: 14px;
      right: 14px;
      font-size: 1rem;
      color: var(--chat-accent);
      opacity: 0.55;
    }

    .danger-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
      background: color-mix(in srgb, #ef4444 4%, transparent);
      border-radius: var(--chat-radius-md);
      padding: 14px 16px;
    }

    .danger-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .danger-title {
      font-size: 0.86rem;
      font-weight: 600;
      color: var(--p-text-color);
    }

    .danger-desc {
      font-size: 0.76rem;
      color: var(--p-text-muted-color);
    }

    .danger-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid color-mix(in srgb, #ef4444 50%, transparent);
      border-radius: 9px;
      background: none;
      color: #f87171;
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 7px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
      flex-shrink: 0;

      i { font-size: 0.75rem; }

      &:hover {
        background: color-mix(in srgb, #ef4444 12%, transparent);
      }
    }

    /* ─── Editor cards / fields ─── */
    .editor-card {
      background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
      border: 1px solid var(--p-surface-800);
      border-radius: var(--chat-radius-md);
      padding: 0 16px 16px;
    }

    .editor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 0;
      border-bottom: 1px solid var(--p-surface-800);
      margin-bottom: 4px;
      position: sticky;
      top: 0;
      z-index: 5;
      background: inherit;
    }

    .editor-title {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;

      > i {
        color: var(--chat-accent);
        font-size: 0.9rem;
      }

      span {
        font-size: 0.92rem;
        font-weight: 650;
        color: var(--p-text-color);
      }
    }

    .editor-title-text {
      display: flex;
      flex-direction: column;
      min-width: 0;

      .editor-subtitle {
        font-size: 0.72rem;
        font-weight: 400;
        color: var(--p-text-muted-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .back-btn {
      display: none;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 8px;
      background: var(--p-surface-800);
      color: var(--p-text-color);
      cursor: pointer;

      i { font-size: 0.75rem; }
    }

    .save-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: none;
      border-radius: 9px;
      background: var(--chat-gradient);
      color: white;
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 8px 16px;
      cursor: pointer;
      transition: filter 0.15s ease, opacity 0.15s ease;
      flex-shrink: 0;

      i { font-size: 0.72rem; }

      &:hover:not(:disabled) { filter: brightness(1.12); }

      &:disabled { opacity: 0.35; cursor: default; }

      &.secondary {
        background: var(--p-surface-800);
        color: var(--p-text-color);
      }
    }

    .field-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      gap: 16px;

      &.vertical {
        flex-direction: column;
        align-items: stretch;
      }

      & + .field-row {
        border-top: 1px solid color-mix(in srgb, var(--p-surface-800) 60%, transparent);
      }
    }

    .field-info {
      display: flex;
      flex-direction: column;
      gap: 2px;

      label {
        font-size: 0.86rem;
        font-weight: 550;
        color: var(--p-text-color);
      }

      .field-desc {
        font-size: 0.74rem;
        color: var(--p-text-muted-color);
      }
    }

    .slider-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .slider-value {
      font-family: var(--chat-font-mono);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--chat-accent);
      min-width: 36px;
      text-align: right;
    }

    .prompt-textarea {
      width: 100%;
      font-size: 0.8rem;
      font-family: var(--chat-font-mono);
      line-height: 1.6;
    }

    /* ─── Agents layout ─── */
    .agents-layout {
      display: grid;
      grid-template-columns: 250px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }

    .agent-rail {
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: sticky;
      top: 0;
    }

    .rail-search {
      display: flex;
      align-items: center;
      position: relative;

      > i {
        position: absolute;
        left: 10px;
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
        z-index: 1;
        pointer-events: none;
      }

      input {
        width: 100%;
        font-size: 0.8rem;
        padding-left: 30px !important;
        background: var(--p-surface-900) !important;
        border-color: var(--p-surface-800) !important;
        border-radius: 10px !important;
      }

      &.wide {
        max-width: 340px;
      }
    }

    .agent-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-height: calc(100dvh - 240px);
      overflow-y: auto;
    }

    .agent-item {
      display: flex;
      flex-direction: column;
      gap: 3px;
      text-align: left;
      background: none;
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 9px 11px;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s ease, border-color 0.15s ease;

      &:hover { background: var(--p-surface-900); }

      &.active {
        background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
        border-color: color-mix(in srgb, var(--p-primary-500) 30%, transparent);
      }
    }

    .agent-item-top {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
    }

    .agent-item-name {
      font-family: var(--chat-font-mono);
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--p-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dirty-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #fbbf24;
      flex-shrink: 0;
      margin-left: auto;
    }

    .agent-item-meta {
      display: flex;
      gap: 5px;
      font-size: 0.68rem;
      color: var(--p-text-muted-color);

      .mono {
        font-family: var(--chat-font-mono);
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .rail-empty {
      font-size: 0.78rem;
      color: var(--p-text-muted-color);
      padding: 16px 10px;
      text-align: center;
    }

    /* ─── Tool chips (agent editor) ─── */
    .tool-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tool-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: color-mix(in srgb, var(--p-primary-500) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--p-primary-500) 20%, transparent);
      color: var(--p-primary-200);
      border-radius: 999px;
      font-family: var(--chat-font-mono);
      font-size: 0.7rem;
      font-weight: 500;
    }

    .tool-chip-remove {
      display: inline-flex;
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--p-primary-200);
      opacity: 0.6;

      &:hover { opacity: 1; }

      i { font-size: 0.6rem; }
    }

    .no-tools {
      font-size: 0.78rem;
      color: var(--p-text-muted-color);
      font-style: italic;
    }

    .add-tool-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }

    /* ─── Tools tab ─── */
    .tools-controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 14px;
    }

    .category-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .category-chip {
      background: none;
      border: 1px solid var(--p-surface-800);
      border-radius: 999px;
      color: var(--p-text-muted-color);
      font-family: inherit;
      font-size: 0.72rem;
      font-weight: 550;
      padding: 4px 12px;
      cursor: pointer;
      transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;

      &:hover { color: var(--p-text-color); }

      &.active {
        color: var(--chat-accent);
        border-color: color-mix(in srgb, var(--p-primary-500) 45%, transparent);
        background: color-mix(in srgb, var(--p-primary-500) 8%, transparent);
      }
    }

    .tool-table {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .tool-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
      border: 1px solid var(--p-surface-800);
      border-radius: var(--chat-radius-md);
      padding: 10px 14px;
    }

    .tool-main {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }

    .tool-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .tool-name {
      font-family: var(--chat-font-mono);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--p-text-color);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.62rem;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-radius: 999px;
      padding: 2px 8px;

      i { font-size: 0.55rem; }

      &.warn {
        color: #fbbf24;
        border: 1px solid color-mix(in srgb, #fbbf24 40%, transparent);
      }

      &.muted {
        color: var(--p-text-muted-color);
        border: 1px solid var(--p-surface-800);
      }
    }

    .tool-desc {
      font-size: 0.74rem;
      color: var(--p-text-muted-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tool-agents {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      justify-content: flex-end;
      flex-shrink: 0;
      max-width: 40%;
    }

    .agent-link {
      background: none;
      border: 1px solid var(--p-surface-700);
      border-radius: 999px;
      color: var(--p-text-muted-color);
      font-family: var(--chat-font-mono);
      font-size: 0.64rem;
      padding: 2px 8px;
      cursor: pointer;
      transition: color 0.15s ease, border-color 0.15s ease;

      &:hover {
        color: var(--chat-accent);
        border-color: var(--chat-accent);
      }
    }

    .unused {
      font-size: 0.68rem;
      color: var(--p-text-muted-color);
      opacity: 0.6;
      font-style: italic;
    }

    /* ─── Responsive ─── */
    @media (max-width: 820px) {
      .control-panel {
        padding: 16px 14px 40px;
      }

      .stat-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .agents-layout {
        grid-template-columns: 1fr;

        /* Master-detail becomes two screens: list, then editor with back */
        &.detail-open .agent-rail { display: none; }
      }

      .agents-layout:not(.detail-open) .agent-editor .empty-panel {
        display: none;
      }

      .back-btn { display: inline-flex; }

      .agent-list { max-height: none; }

      .field-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }

      .tool-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }

      .tool-agents {
        justify-content: flex-start;
        max-width: none;
      }
    }
  `,
})
export class ControlPanelPageComponent implements OnInit {
  private readonly gateway = inject(GatewayApiService);
  private readonly messageService = inject(MessageService);

  readonly tabs: { id: PanelTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'pi-th-large' },
    { id: 'orchestrator', label: 'Orchestrator', icon: 'pi-sitemap' },
    { id: 'agents', label: 'Agents', icon: 'pi-users' },
    { id: 'tools', label: 'Tools', icon: 'pi-wrench' },
  ];

  readonly activeTab = signal<PanelTab>('overview');
  readonly config = signal<GatewayConfig | null>(null);
  readonly health = signal<GatewayHealthInfo | null>(null);
  readonly models = signal<GatewayModelInfo[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Agents tab state
  readonly selectedAgent = signal<string | null>(null);
  readonly agentSearch = signal('');

  // Tools tab state
  readonly toolSearch = signal('');
  readonly toolCategoryFilter = signal<string | null>(null);

  // Form state for orchestrator
  readonly orchModel = signal('');
  readonly orchMaxDelegations = signal(5);
  readonly orchSystemPrompt = signal('');

  // Form state for each sub-agent (keyed by name), wrapped in a signal so
  // dirty indicators update reactively
  readonly agentForms = signal<Record<string, AgentForm>>({});

  // Snapshot of original values for dirty checking
  private orchOriginal = { model: '', maxDelegations: 5, systemPrompt: '' };
  private agentOriginals: Record<string, string> = {}; // JSON snapshots

  // Tool addition selection state
  addToolSelections: Record<string, string> = {};

  readonly modelOptions = computed(() =>
    this.models().map((m) => ({
      name: m.name,
      label: `${m.name}${m.sizeGb ? ` (${m.sizeGb}GB)` : ''}`,
    }))
  );

  readonly orchestratorDirty = computed(() => {
    return (
      this.orchModel() !== this.orchOriginal.model ||
      this.orchMaxDelegations() !== this.orchOriginal.maxDelegations ||
      this.orchSystemPrompt() !== this.orchOriginal.systemPrompt
    );
  });

  readonly dirtyAgentCount = computed(() => {
    const forms = this.agentForms();
    return Object.keys(forms).filter((name) => this.isAgentDirtyForm(name))
      .length;
  });

  readonly filteredAgents = computed(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const query = this.agentSearch().trim().toLowerCase();
    if (!query) return cfg.subAgents;
    return cfg.subAgents.filter(
      (sa) =>
        sa.name.toLowerCase().includes(query) ||
        sa.description.toLowerCase().includes(query)
    );
  });

  readonly selectedAgentDef = computed(() => {
    const cfg = this.config();
    const name = this.selectedAgent();
    if (!cfg || !name) return null;
    return cfg.subAgents.find((sa) => sa.name === name) ?? null;
  });

  readonly toolCategories = computed(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const cats = new Set<string>();
    for (const tool of cfg.tools) cats.add(tool.category || 'other');
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  });

  readonly filteredTools = computed<GatewayToolInfo[]>(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const query = this.toolSearch().trim().toLowerCase();
    const category = this.toolCategoryFilter();
    return cfg.tools.filter((tool) => {
      if (category && (tool.category || 'other') !== category) return false;
      if (!query) return true;
      return (
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query)
      );
    });
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
        // Keep the selection valid across refreshes
        const selected = this.selectedAgent();
        if (selected && !cfg.subAgents.some((sa) => sa.name === selected)) {
          this.selectedAgent.set(null);
        }
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
    this.orchSystemPrompt.set(cfg.orchestrator.systemPrompt || '');
    this.orchOriginal = {
      model: this.orchModel(),
      maxDelegations: this.orchMaxDelegations(),
      systemPrompt: this.orchSystemPrompt(),
    };
  }

  private initAgentForms(cfg: GatewayConfig): void {
    const forms: Record<string, AgentForm> = {};
    this.agentOriginals = {};
    for (const sa of cfg.subAgents) {
      const form: AgentForm = {
        model: sa.agent.model || '',
        systemPrompt: sa.agent.systemPrompt || '',
        tools: [...(sa.agent.tools || [])],
        temperature: Math.round((sa.agent.temperature ?? 0.7) * 100),
        maxIterations: sa.agent.maxIterations || 10,
      };
      forms[sa.name] = form;
      this.agentOriginals[sa.name] = JSON.stringify(form);
    }
    this.agentForms.set(forms);
  }

  selectAgent(name: string): void {
    this.selectedAgent.set(name);
  }

  /** Jump from the tools tab straight into an agent's editor. */
  openAgent(name: string): void {
    this.selectedAgent.set(name);
    this.activeTab.set('agents');
  }

  shortAgentName(name: string): string {
    return name.replace(/-agent$/, '');
  }

  getAgentForm(name: string): AgentForm {
    return (
      this.agentForms()[name] || {
        model: '',
        systemPrompt: '',
        tools: [],
        temperature: 70,
        maxIterations: 10,
      }
    );
  }

  updateAgentForm(name: string, field: keyof AgentForm, value: unknown): void {
    this.agentForms.update((forms) => {
      if (!forms[name]) return forms;
      return {
        ...forms,
        [name]: { ...forms[name], [field]: value },
      };
    });
  }

  private isAgentDirtyForm(name: string): boolean {
    const form = this.agentForms()[name];
    if (!form || !this.agentOriginals[name]) return false;
    return JSON.stringify(form) !== this.agentOriginals[name];
  }

  isAgentDirty(name: string): boolean {
    return this.isAgentDirtyForm(name);
  }

  agentsUsingTool(toolName: string): string[] {
    const forms = this.agentForms();
    return Object.keys(forms).filter((name) =>
      forms[name].tools.includes(toolName)
    );
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
    if (!toolName) return;
    this.updateAgentForm(agentName, 'tools', [
      ...this.getAgentForm(agentName).tools,
      toolName,
    ]);
    this.addToolSelections[agentName] = '';
  }

  removeToolFromAgent(agentName: string, toolName: string): void {
    this.updateAgentForm(
      agentName,
      'tools',
      this.getAgentForm(agentName).tools.filter((t) => t !== toolName)
    );
  }

  saveOrchestrator(): void {
    const updates: Record<string, unknown> = {};
    if (this.orchModel() !== this.orchOriginal.model) {
      updates['model'] = this.orchModel() || undefined;
    }
    if (this.orchMaxDelegations() !== this.orchOriginal.maxDelegations) {
      updates['maxDelegations'] = this.orchMaxDelegations();
    }
    if (this.orchSystemPrompt() !== this.orchOriginal.systemPrompt) {
      updates['systemPrompt'] = this.orchSystemPrompt();
    }

    this.gateway.updateOrchestrator(updates as never).subscribe({
      next: () => {
        this.orchOriginal = {
          model: this.orchModel(),
          maxDelegations: this.orchMaxDelegations(),
          systemPrompt: this.orchSystemPrompt(),
        };
        // Recompute dirty state
        this.orchModel.set(this.orchModel());
        this.messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Orchestrator configuration updated',
          life: 3000,
        });
      },
      error: () => {
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
    const form = this.agentForms()[name];
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
          // Nudge the signal so dirty indicators recompute
          this.agentForms.update((forms) => ({ ...forms }));
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
