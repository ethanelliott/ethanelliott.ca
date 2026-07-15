import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, JsonPipe } from '@angular/common';
import { MessageService } from 'primeng/api';
import {
  NgDiagramComponent,
  NgDiagramModelService,
  NgDiagramSelectionService,
  NgDiagramNodeTemplateMap,
  initializeModel,
  provideNgDiagram,
  type ModelAdapter,
  type Node,
  type Edge,
  type EdgeDrawnEvent,
  type SelectionChangedEvent,
} from 'ng-diagram';
import { WorkflowApiService } from '../../services/workflow-api.service';
import { ChatApiService } from '../../services/chat-api.service';
import {
  Workflow,
  WorkflowGraph,
  StepTypeInfo,
  GraphValidationError,
  WorkflowRunSummary,
  WorkflowRunDetail,
} from '../../models/workflow.types';
import {
  WorkflowNodeComponent,
  WorkflowNodeData,
} from './workflow-node.component';

interface ToolInfo {
  name: string;
  description: string;
  category?: string;
  parameters?: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

@Component({
  selector: 'app-workflow-editor-page',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, JsonPipe, NgDiagramComponent],
  providers: [provideNgDiagram()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="editor-shell">
      <!-- ─── Toolbar ─── -->
      <div class="editor-toolbar">
        <div class="toolbar-left">
          <a routerLink="/workflows" class="icon-btn" title="All workflows">
            <i class="pi pi-arrow-left"></i>
          </a>
          <input
            class="name-input"
            [ngModel]="workflowName()"
            (ngModelChange)="workflowName.set($event); dirty.set(true)"
            placeholder="Workflow name"
          />
          @if (dirty()) {
          <span class="dirty-dot" title="Unsaved changes"></span>
          }
        </div>
        <div class="toolbar-right">
          @if (validationErrors().length) {
          <span
            class="validation-pill"
            [title]="validationMessages()"
          >
            <i class="pi pi-exclamation-triangle"></i>
            {{ validationErrors().length }}
          </span>
          }
          <button
            class="ghost-btn"
            [class.active]="runsOpen()"
            (click)="toggleRuns()"
          >
            <i class="pi pi-history"></i>
            Runs
          </button>
          <button class="ghost-btn" [disabled]="saving()" (click)="save()">
            <i class="pi pi-save"></i>
            Save
          </button>
          <button
            class="primary-btn"
            [disabled]="saving() || running()"
            (click)="saveAndRun()"
          >
            @if (running()) {
            <i class="pi pi-spin pi-spinner"></i>
            } @else {
            <i class="pi pi-play"></i>
            }
            Run
          </button>
        </div>
      </div>

      <div class="editor-body">
        <!-- ─── Palette ─── -->
        <div class="palette">
          <div class="palette-title">Steps</div>
          @for (step of stepTypes(); track step.kind) { @if (!step.isTrigger) {
          <button
            class="palette-item"
            (click)="addNode(step)"
            [title]="step.description"
          >
            <i class="pi" [class]="'pi ' + kindIcon(step.kind)"></i>
            <span>{{ step.name }}</span>
            <i class="pi pi-plus add-icon"></i>
          </button>
          } }
          <div class="palette-hint">
            Click to add a step, then drag from a port to connect. Select a
            step to configure it.
          </div>
        </div>

        <!-- ─── Canvas ─── -->
        <div class="canvas-wrap">
          @if (model(); as diagramModelValue) {
          <ng-diagram
            [model]="diagramModelValue"
            [nodeTemplateMap]="nodeTemplateMap"
            (edgeDrawn)="onEdgeDrawn($event)"
            (selectionChanged)="onSelectionChanged($event)"
          />
          }
        </div>

        <!-- ─── Config panel ─── -->
        @if (selectedNode(); as node) {
        <div class="config-panel">
          <div class="panel-head">
            <span class="panel-kind">{{ nodeData(node).kind }}</span>
            @if (nodeData(node).kind !== 'manual_trigger') {
            <button
              class="icon-btn danger"
              title="Delete step"
              (click)="deleteSelected()"
            >
              <i class="pi pi-trash"></i>
            </button>
            }
          </div>

          <label class="field-label">Label</label>
          <input
            class="field-input"
            [ngModel]="nodeData(node).label"
            (ngModelChange)="updateData(node.id, { label: $event })"
          />

          @for (prop of configProps(node); track prop.key) {
          <label class="field-label"
            >{{ prop.key }}
            @if (prop.required) {<span class="req">*</span>}
          </label>
          @if (prop.description) {
          <span class="field-desc">{{ prop.description }}</span>
          }

          <!-- tool picker -->
          @if (nodeData(node).kind === 'tool_call' && prop.key === 'tool') {
          <select
            class="field-input"
            [ngModel]="configValue(node, 'tool')"
            (ngModelChange)="setToolAndSeedParams(node, $event)"
          >
            <option value="">— select a tool —</option>
            @for (tool of tools(); track tool.name) {
            <option [value]="tool.name">{{ tool.name }}</option>
            }
          </select>
          @if (selectedTool(node); as tool) {
          <span class="field-desc tool-desc">{{ tool.description }}</span>
          } } @else if (prop.enum?.length) {
          <select
            class="field-input"
            [ngModel]="configValue(node, prop.key)"
            (ngModelChange)="setConfig(node, prop.key, $event)"
          >
            <option value="">—</option>
            @for (option of prop.enum; track option) {
            <option [value]="option">{{ option }}</option>
            }
          </select>
          } @else if (prop.type === 'boolean') {
          <label class="check-row">
            <input
              type="checkbox"
              [ngModel]="configValue(node, prop.key) === true"
              (ngModelChange)="setConfig(node, prop.key, $event)"
            />
            <span>enabled</span>
          </label>
          } @else if (prop.type === 'number') {
          <input
            class="field-input"
            type="number"
            [ngModel]="configValue(node, prop.key)"
            (ngModelChange)="setConfig(node, prop.key, toNumber($event))"
          />
          } @else if (prop.type === 'object') {
          <textarea
            class="field-input mono"
            rows="6"
            [class.invalid]="jsonInvalid()[node.id + ':' + prop.key]"
            [ngModel]="jsonDraft(node, prop.key)"
            (ngModelChange)="setJsonDraft(node, prop.key, $event)"
            (blur)="commitJson(node, prop.key)"
          ></textarea>
          } @else if (isLongText(prop.key)) {
          <textarea
            class="field-input"
            rows="5"
            [ngModel]="configValue(node, prop.key)"
            (ngModelChange)="setConfig(node, prop.key, $event)"
          ></textarea>
          } @else {
          <input
            class="field-input"
            [ngModel]="configValue(node, prop.key)"
            (ngModelChange)="setConfig(node, prop.key, $event)"
          />
          } }

          <div class="field-row-2">
            <div>
              <label class="field-label">Timeout (ms)</label>
              <input
                class="field-input"
                type="number"
                placeholder="60000"
                [ngModel]="nodeData(node).timeoutMs"
                (ngModelChange)="updateData(node.id, { timeoutMs: toNumber($event) })"
              />
            </div>
            <div>
              <label class="field-label">Retries</label>
              <input
                class="field-input"
                type="number"
                placeholder="0"
                [ngModel]="nodeData(node).retries"
                (ngModelChange)="updateData(node.id, { retries: toNumber($event) })"
              />
            </div>
          </div>

          <div class="template-hint">
            Values support templates:
            <code>{{ '{{input.field}}' }}</code>
            <code>{{ '{{nodes.stepId.field}}' }}</code>
          </div>
        </div>
        }

        <!-- ─── Runs drawer ─── -->
        @if (runsOpen()) {
        <div class="runs-panel">
          <div class="panel-head">
            <span>Run history</span>
            <button class="icon-btn" (click)="runsOpen.set(false)">
              <i class="pi pi-times"></i>
            </button>
          </div>
          @if (activeRun(); as run) {
          <div class="run-detail">
            <div class="run-status-row">
              <span
                class="run-pill"
                [class.ok]="run.status === 'succeeded'"
                [class.bad]="run.status === 'failed'"
                [class.busy]="run.status === 'running'"
                >{{ run.status }}</span
              >
              @if (run.status === 'running') {
              <button class="ghost-btn small" (click)="cancelRun(run.id)">
                Cancel
              </button>
              }
              <button class="ghost-btn small" (click)="activeRunId.set(null)">
                Back
              </button>
            </div>
            @if (run.error) {
            <div class="run-error">{{ run.error }}</div>
            }
            <div class="step-list">
              @for (step of run.steps; track step.id) {
              <div class="step-item">
                <div
                  class="step-head"
                  (click)="toggleStep(step.id)"
                >
                  @switch (step.status) { @case ('succeeded') {
                  <i class="pi pi-check-circle ok"></i>
                  } @case ('failed') {
                  <i class="pi pi-times-circle bad"></i>
                  } @case ('running') {
                  <i class="pi pi-spin pi-spinner busy"></i>
                  } @default {
                  <i class="pi pi-minus-circle"></i>
                  } }
                  <span class="step-node">{{ step.nodeId }}</span>
                  <span class="step-kind">{{ step.kind }}</span>
                  <span class="step-ms">
                    @if (step.attempts > 1) {×{{ step.attempts }} · }
                    {{ step.durationMs }}ms
                  </span>
                </div>
                @if (expandedSteps().has(step.id)) {
                <div class="step-io">
                  @if (step.error) {
                  <div class="run-error">{{ step.error }}</div>
                  }
                  <div class="io-label">input</div>
                  <pre>{{ step.input | json }}</pre>
                  <div class="io-label">output</div>
                  <pre>{{ step.output | json }}</pre>
                </div>
                }
              </div>
              }
            </div>
          </div>
          } @else {
          <div class="run-list">
            @for (run of runs(); track run.id) {
            <button class="run-row" (click)="openRun(run.id)">
              <span
                class="run-pill"
                [class.ok]="run.status === 'succeeded'"
                [class.bad]="run.status === 'failed'"
                [class.busy]="run.status === 'running'"
                >{{ run.status }}</span
              >
              <span class="run-when">{{
                run.startedAt | date : 'MMM d, HH:mm:ss'
              }}</span>
              <i class="pi pi-chevron-right"></i>
            </button>
            } @empty {
            <div class="runs-empty">No runs yet</div>
            }
          </div>
          }
        </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .editor-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--p-surface-950);
    }

    .editor-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--p-surface-800);
      flex-shrink: 0;
    }

    .toolbar-left,
    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .name-input {
      background: none;
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--p-text-color);
      font-family: inherit;
      font-size: 0.92rem;
      font-weight: 650;
      padding: 6px 10px;
      min-width: 240px;
      outline: none;

      &:hover, &:focus { border-color: var(--p-surface-700); }
    }

    .dirty-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #fbbf24;
    }

    .validation-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
      color: #fbbf24;
      border: 1px solid color-mix(in srgb, #fbbf24 40%, transparent);
      border-radius: 999px;
      padding: 4px 10px;

      i { font-size: 0.7rem; }
    }

    .primary-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: none;
      border-radius: 9px;
      background: var(--chat-gradient);
      color: white;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 8px 16px;
      cursor: pointer;

      i { font-size: 0.72rem; }

      &:hover:not(:disabled) { filter: brightness(1.12); }
      &:disabled { opacity: 0.45; cursor: default; }
    }

    .ghost-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid var(--p-surface-700);
      border-radius: 9px;
      background: none;
      color: var(--p-text-muted-color);
      font-family: inherit;
      font-size: 0.8rem;
      padding: 8px 12px;
      cursor: pointer;

      i { font-size: 0.72rem; }

      &:hover:not(:disabled), &.active { color: var(--p-text-color); border-color: var(--p-surface-500); }
      &:disabled { opacity: 0.45; cursor: default; }

      &.small { padding: 4px 10px; font-size: 0.72rem; }
    }

    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: 1px solid var(--p-surface-800);
      border-radius: 8px;
      background: none;
      color: var(--p-text-muted-color);
      cursor: pointer;
      text-decoration: none;

      i { font-size: 0.75rem; }

      &:hover { color: var(--p-text-color); border-color: var(--p-surface-600); }
      &.danger:hover { color: #f87171; }
    }

    .editor-body {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    /* ─── Palette ─── */
    .palette {
      width: 190px;
      flex-shrink: 0;
      border-right: 1px solid var(--p-surface-800);
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
    }

    .palette-title {
      font-size: 0.66rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--p-text-muted-color);
      padding: 0 6px 6px;
    }

    .palette-item {
      display: flex;
      align-items: center;
      gap: 9px;
      border: 1px solid var(--p-surface-800);
      border-radius: 10px;
      background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
      color: var(--p-text-color);
      font-family: inherit;
      font-size: 0.76rem;
      font-weight: 550;
      padding: 9px 10px;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s ease;

      > i:first-child {
        font-size: 0.78rem;
        color: var(--chat-accent);
      }

      .add-icon {
        margin-left: auto;
        font-size: 0.6rem;
        opacity: 0;
        transition: opacity 0.15s ease;
      }

      &:hover {
        border-color: var(--chat-accent);

        .add-icon { opacity: 1; }
      }
    }

    .palette-hint {
      font-size: 0.66rem;
      line-height: 1.5;
      color: var(--p-text-muted-color);
      padding: 10px 6px;
      margin-top: auto;
    }

    /* ─── Canvas ─── */
    .canvas-wrap {
      flex: 1;
      min-width: 0;
      position: relative;

      ng-diagram {
        position: absolute;
        inset: 0;
      }
    }

    /* ─── Panels ─── */
    .config-panel,
    .runs-panel {
      width: 300px;
      flex-shrink: 0;
      border-left: 1px solid var(--p-surface-800);
      padding: 14px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: color-mix(in srgb, var(--p-surface-900) 45%, var(--p-surface-950));
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 0.84rem;
      font-weight: 650;
      color: var(--p-text-color);
    }

    .panel-kind {
      font-family: var(--chat-font-mono);
      font-size: 0.78rem;
      color: var(--chat-accent);
    }

    .field-label {
      font-size: 0.7rem;
      font-weight: 650;
      color: var(--p-text-color);
      margin-top: 10px;

      .req { color: #f87171; }
    }

    .field-desc {
      font-size: 0.66rem;
      color: var(--p-text-muted-color);
      line-height: 1.4;

      &.tool-desc { margin-top: 4px; }
    }

    .field-input {
      width: 100%;
      box-sizing: border-box;
      background: var(--p-surface-950);
      border: 1px solid var(--p-surface-700);
      border-radius: 8px;
      color: var(--p-text-color);
      font-family: inherit;
      font-size: 0.78rem;
      padding: 7px 9px;
      margin-top: 4px;
      outline: none;

      &:focus { border-color: var(--chat-accent); }

      &.mono {
        font-family: var(--chat-font-mono);
        font-size: 0.7rem;
        line-height: 1.5;
      }

      &.invalid { border-color: #f87171; }
    }

    textarea.field-input { resize: vertical; }

    select.field-input { appearance: auto; }

    .check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.76rem;
      color: var(--p-text-color);
      margin-top: 6px;
    }

    .field-row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 4px;
    }

    .template-hint {
      font-size: 0.64rem;
      color: var(--p-text-muted-color);
      line-height: 1.6;
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid var(--p-surface-800);

      code {
        font-family: var(--chat-font-mono);
        font-size: 0.6rem;
        background: var(--p-surface-800);
        border-radius: 4px;
        padding: 1px 5px;
        margin: 0 2px;
      }
    }

    /* ─── Runs ─── */
    .run-list { display: flex; flex-direction: column; gap: 4px; }

    .run-row {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid var(--p-surface-800);
      border-radius: 10px;
      background: none;
      color: var(--p-text-color);
      font-family: inherit;
      font-size: 0.74rem;
      padding: 9px 10px;
      cursor: pointer;

      &:hover { border-color: var(--p-surface-600); }

      .run-when { flex: 1; text-align: left; color: var(--p-text-muted-color); }

      > i { font-size: 0.6rem; color: var(--p-text-muted-color); }
    }

    .run-pill {
      font-family: var(--chat-font-mono);
      font-size: 0.6rem;
      font-weight: 650;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid var(--p-surface-700);
      color: var(--p-text-muted-color);

      &.ok { color: #34d399; border-color: color-mix(in srgb, #34d399 40%, transparent); }
      &.bad { color: #f87171; border-color: color-mix(in srgb, #f87171 40%, transparent); }
      &.busy { color: var(--chat-accent); border-color: color-mix(in srgb, var(--p-primary-500) 45%, transparent); }
    }

    .runs-empty {
      font-size: 0.76rem;
      color: var(--p-text-muted-color);
      text-align: center;
      padding: 24px 0;
    }

    .run-status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .run-error {
      font-size: 0.7rem;
      color: #fca5a5;
      background: color-mix(in srgb, #ef4444 8%, transparent);
      border-radius: 8px;
      padding: 8px 10px;
      margin: 6px 0;
      word-break: break-word;
    }

    .step-list { display: flex; flex-direction: column; gap: 4px; }

    .step-item {
      border: 1px solid var(--p-surface-800);
      border-radius: 10px;
      overflow: hidden;
    }

    .step-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      cursor: pointer;
      font-size: 0.72rem;

      &:hover { background: var(--p-surface-900); }

      i { font-size: 0.72rem; }
      .ok { color: #34d399; }
      .bad { color: #f87171; }
      .busy { color: var(--chat-accent); }
    }

    .step-node {
      font-family: var(--chat-font-mono);
      font-weight: 650;
      color: var(--p-text-color);
    }

    .step-kind { color: var(--p-text-muted-color); font-size: 0.64rem; }

    .step-ms {
      margin-left: auto;
      font-family: var(--chat-font-mono);
      font-size: 0.62rem;
      color: var(--p-text-muted-color);
    }

    .step-io {
      border-top: 1px solid var(--p-surface-800);
      padding: 8px 10px;

      .io-label {
        font-size: 0.6rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--p-text-muted-color);
        margin: 6px 0 2px;
      }

      pre {
        margin: 0;
        font-family: var(--chat-font-mono);
        font-size: 0.62rem;
        line-height: 1.5;
        color: var(--p-text-color);
        background: var(--p-surface-950);
        border-radius: 6px;
        padding: 6px 8px;
        overflow-x: auto;
        max-height: 160px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
    }
  `,
})
export class WorkflowEditorPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(WorkflowApiService);
  private readonly chatApi = inject(ChatApiService);
  private readonly messageService = inject(MessageService);
  private readonly injector = inject(Injector);
  private readonly diagramModel = inject(NgDiagramModelService);
  private readonly selection = inject(NgDiagramSelectionService);

  readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
    ['workflow-node', WorkflowNodeComponent],
  ]);

  readonly model = signal<ModelAdapter | null>(null);
  readonly workflowName = signal('');
  workflow: Workflow | null = null;

  readonly stepTypes = signal<StepTypeInfo[]>([]);
  readonly tools = signal<ToolInfo[]>([]);
  readonly selectedNodeId = signal<string | null>(null);
  readonly validationErrors = signal<GraphValidationError[]>([]);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly running = signal(false);

  readonly runsOpen = signal(false);
  readonly runs = signal<WorkflowRunSummary[]>([]);
  readonly activeRunId = signal<string | null>(null);
  readonly activeRun = signal<WorkflowRunDetail | null>(null);
  readonly expandedSteps = signal<Set<string>>(new Set());
  readonly jsonInvalid = signal<Record<string, boolean>>({});

  private jsonDrafts: Record<string, string> = {};
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly selectedNode = computed(() => {
    const id = this.selectedNodeId();
    if (!id) return null;
    return this.diagramModel.nodes().find((n) => n.id === id) ?? null;
  });

  readonly validationMessages = computed(() =>
    this.validationErrors()
      .map((e) => e.message)
      .join('\n')
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;

    this.api.getStepTypes().subscribe({
      next: (res) => this.stepTypes.set(res.stepTypes),
    });
    this.chatApi.getTools().subscribe({
      next: (res) => this.tools.set(res.tools as ToolInfo[]),
    });

    this.api.get(id).subscribe({
      next: (wf) => {
        this.workflow = wf;
        this.workflowName.set(wf.name);
        this.model.set(
          initializeModel(this.graphToModel(wf.graph), this.injector)
        );
        this.refreshRuns();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Not found',
          detail: 'Workflow could not be loaded',
          life: 4000,
        });
        this.router.navigate(['/workflows']);
      },
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /** ─── graph ⇄ diagram conversion ─────────────────────────────── */

  private graphToModel(graph: WorkflowGraph): {
    nodes: Node[];
    edges: Edge[];
  } {
    return {
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        type: 'workflow-node',
        position: n.position ?? { x: 100, y: 100 },
        data: {
          kind: n.kind,
          label: n.label ?? n.kind,
          config: n.config ?? {},
          timeoutMs: n.timeoutMs,
          retries: n.retries,
        } satisfies WorkflowNodeData,
      })),
      edges: graph.edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        sourcePort: e.condition ?? 'out',
        targetPort: 'in',
        targetArrowhead: 'ng-diagram-arrow',
        data: {},
      })),
    };
  }

  private modelToGraph(): WorkflowGraph {
    const nodes = this.diagramModel.nodes().map((n) => {
      const data = n.data as WorkflowNodeData;
      return {
        id: n.id,
        kind: data.kind,
        label: data.label,
        config: data.config ?? {},
        position: { x: n.position.x, y: n.position.y },
        timeoutMs: data.timeoutMs || undefined,
        retries: data.retries || undefined,
      };
    });
    const conditionIds = new Set(
      nodes.filter((n) => n.kind === 'condition').map((n) => n.id)
    );
    const edges = this.diagramModel.edges().map((e) => ({
      id: e.id,
      from: e.source,
      to: e.target,
      condition:
        conditionIds.has(e.source) &&
        (e.sourcePort === 'true' || e.sourcePort === 'false')
          ? (e.sourcePort as 'true' | 'false')
          : undefined,
    }));
    return { nodes, edges };
  }

  /** ─── canvas events ──────────────────────────────────────────── */

  onSelectionChanged(event: SelectionChangedEvent): void {
    this.selectedNodeId.set(event.selectedNodes[0]?.id ?? null);
    this.dirty.set(true);
  }

  onEdgeDrawn(_event: EdgeDrawnEvent): void {
    this.dirty.set(true);
  }

  addNode(step: StepTypeInfo): void {
    const id = `${step.kind}_${Math.random().toString(36).slice(2, 7)}`;
    const existing = this.diagramModel.nodes().length;
    this.diagramModel.addNodes([
      {
        id,
        type: 'workflow-node',
        position: { x: 140 + existing * 40, y: 120 + existing * 30 },
        data: {
          kind: step.kind,
          label: step.name,
          config: {},
        } satisfies WorkflowNodeData,
      },
    ]);
    this.selection.select([id]);
    this.selectedNodeId.set(id);
    this.dirty.set(true);
  }

  deleteSelected(): void {
    const id = this.selectedNodeId();
    if (!id) return;
    this.diagramModel.deleteNodes([id]);
    this.selectedNodeId.set(null);
    this.dirty.set(true);
  }

  /** ─── config panel helpers ───────────────────────────────────── */

  nodeData(node: Node): WorkflowNodeData {
    return node.data as WorkflowNodeData;
  }

  configProps(node: Node): {
    key: string;
    type: string;
    description?: string;
    enum?: string[];
    required: boolean;
  }[] {
    const step = this.stepTypes().find(
      (s) => s.kind === this.nodeData(node).kind
    );
    if (!step) return [];
    const required = new Set(step.configSchema.required ?? []);
    return Object.entries(step.configSchema.properties ?? {}).map(
      ([key, prop]) => ({
        key,
        type: prop.type,
        description: prop.description,
        enum: prop.enum,
        required: required.has(key),
      })
    );
  }

  configValue(node: Node, key: string): unknown {
    return this.nodeData(node).config?.[key];
  }

  setConfig(node: Node, key: string, value: unknown): void {
    const data = this.nodeData(node);
    this.updateData(node.id, {
      config: { ...data.config, [key]: value },
    });
  }

  updateData(nodeId: string, patch: Partial<WorkflowNodeData>): void {
    const node = this.diagramModel.getNodeById(nodeId);
    if (!node) return;
    this.diagramModel.updateNodeData(nodeId, {
      ...(node.data as WorkflowNodeData),
      ...patch,
    });
    this.dirty.set(true);
  }

  selectedTool(node: Node): ToolInfo | null {
    const name = this.configValue(node, 'tool');
    if (!name) return null;
    return this.tools().find((t) => t.name === name) ?? null;
  }

  /** Selecting a tool seeds the params object with its parameter names */
  setToolAndSeedParams(node: Node, toolName: string): void {
    const tool = this.tools().find((t) => t.name === toolName);
    const params: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(
      tool?.parameters?.properties ?? {}
    )) {
      if ((tool?.parameters?.required ?? []).includes(key)) {
        params[key] = prop.type === 'number' ? 0 : '';
      }
    }
    const data = this.nodeData(node);
    this.updateData(node.id, {
      config: { ...data.config, tool: toolName, params },
    });
    delete this.jsonDrafts[`${node.id}:params`];
  }

  isLongText(key: string): boolean {
    return ['prompt', 'system', 'message', 'template'].includes(key);
  }

  toNumber(value: unknown): number | undefined {
    const n = parseFloat(String(value));
    return isNaN(n) ? undefined : n;
  }

  jsonDraft(node: Node, key: string): string {
    const draftKey = `${node.id}:${key}`;
    if (this.jsonDrafts[draftKey] === undefined) {
      this.jsonDrafts[draftKey] = JSON.stringify(
        this.configValue(node, key) ?? {},
        null,
        2
      );
    }
    return this.jsonDrafts[draftKey];
  }

  setJsonDraft(node: Node, key: string, value: string): void {
    this.jsonDrafts[`${node.id}:${key}`] = value;
  }

  commitJson(node: Node, key: string): void {
    const draftKey = `${node.id}:${key}`;
    const draft = this.jsonDrafts[draftKey];
    try {
      const parsed = JSON.parse(draft || '{}');
      this.setConfig(node, key, parsed);
      this.jsonInvalid.update((m) => ({ ...m, [draftKey]: false }));
    } catch {
      this.jsonInvalid.update((m) => ({ ...m, [draftKey]: true }));
    }
  }

  /** ─── save / run ─────────────────────────────────────────────── */

  save(onSaved?: () => void): void {
    if (!this.workflow) return;
    const graph = this.modelToGraph();
    this.saving.set(true);
    this.api
      .update(this.workflow.id, {
        name: this.workflowName().trim() || this.workflow.name,
        graph,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dirty.set(false);
          this.validationErrors.set([]);
          if (onSaved) onSaved();
          else {
            this.messageService.add({
              severity: 'success',
              summary: 'Saved',
              life: 2000,
            });
          }
        },
        error: (err) => {
          this.saving.set(false);
          const errors = err?.error?.errors as
            | GraphValidationError[]
            | undefined;
          this.validationErrors.set(errors ?? []);
          this.messageService.add({
            severity: 'error',
            summary: 'Save failed',
            detail:
              errors?.map((e) => e.message).join(' · ') ||
              err?.error?.error ||
              'Unknown error',
            life: 6000,
          });
        },
      });
  }

  saveAndRun(): void {
    this.save(() => {
      if (!this.workflow) return;
      this.running.set(true);
      this.api.run(this.workflow.id).subscribe({
        next: (res) => {
          this.runsOpen.set(true);
          this.openRun(res.runId);
        },
        error: (err) => {
          this.running.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Run failed to start',
            detail:
              err?.error?.errors?.map((e: GraphValidationError) => e.message).join(' · ') ||
              err?.error?.error ||
              'Unknown error',
            life: 6000,
          });
        },
      });
    });
  }

  /** ─── runs panel ─────────────────────────────────────────────── */

  toggleRuns(): void {
    this.runsOpen.update((v) => !v);
    if (this.runsOpen()) this.refreshRuns();
  }

  refreshRuns(): void {
    if (!this.workflow) return;
    this.api.runs(this.workflow.id).subscribe({
      next: (res) => this.runs.set(res.runs),
    });
  }

  openRun(runId: string): void {
    this.activeRunId.set(runId);
    this.expandedSteps.set(new Set());
    this.pollRun(runId);
    this.stopPolling();
    this.pollTimer = setInterval(() => this.pollRun(runId), 800);
  }

  private pollRun(runId: string): void {
    this.api.runDetail(runId).subscribe({
      next: (run) => {
        if (this.activeRunId() !== runId) return;
        this.activeRun.set(run);
        if (run.status !== 'running') {
          this.running.set(false);
          this.stopPolling();
          this.refreshRuns();
        }
      },
      error: () => this.stopPolling(),
    });
  }

  cancelRun(runId: string): void {
    this.api.cancelRun(runId).subscribe({
      next: () => this.pollRun(runId),
    });
  }

  toggleStep(stepId: string): void {
    this.expandedSteps.update((set) => {
      const next = new Set(set);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  kindIcon(kind: string): string {
    const icons: Record<string, string> = {
      tool_call: 'pi-wrench',
      llm_prompt: 'pi-sparkles',
      condition: 'pi-directions',
      transform: 'pi-sliders-h',
      notify: 'pi-bell',
    };
    return icons[kind] || 'pi-box';
  }
}
