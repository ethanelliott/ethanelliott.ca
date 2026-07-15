import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  NgDiagramNodeTemplate,
  NgDiagramPortComponent,
  SimpleNode,
} from 'ng-diagram';

/** Data carried by every workflow node on the canvas */
export interface WorkflowNodeData {
  kind: string;
  label: string;
  config: Record<string, unknown>;
  timeoutMs?: number;
  retries?: number;
  [key: string]: unknown;
}

const KIND_META: Record<string, { icon: string; accent: string }> = {
  manual_trigger: { icon: 'pi-play-circle', accent: '#34d399' },
  tool_call: { icon: 'pi-wrench', accent: '#a78bfa' },
  llm_prompt: { icon: 'pi-sparkles', accent: '#818cf8' },
  condition: { icon: 'pi-directions', accent: '#fbbf24' },
  transform: { icon: 'pi-sliders-h', accent: '#22d3ee' },
  notify: { icon: 'pi-bell', accent: '#f472b6' },
};

@Component({
  selector: 'app-workflow-node',
  standalone: true,
  imports: [NgDiagramPortComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="wf-node"
      [class.selected]="node().selected"
      [style.--node-accent]="meta().accent"
    >
      <div class="wf-node-head">
        <i class="pi" [class]="'pi ' + meta().icon"></i>
        <span class="wf-node-label">{{ data().label || data().kind }}</span>
      </div>
      <div class="wf-node-kind">{{ data().kind }}</div>
      @if (data().kind === 'tool_call' && data().config['tool']) {
      <div class="wf-node-detail">{{ data().config['tool'] }}</div>
      }

      <!-- Input port (everything except triggers) -->
      @if (data().kind !== 'manual_trigger') {
      <ng-diagram-port id="in" side="left" type="target" />
      }

      <!-- Output ports: condition nodes branch true/false -->
      @if (data().kind === 'condition') {
      <div class="branch-labels">
        <span class="branch true">✓</span>
        <span class="branch false">✗</span>
      </div>
      <ng-diagram-port id="true" side="right" type="source" />
      <ng-diagram-port id="false" side="bottom" type="source" />
      } @else {
      <ng-diagram-port id="out" side="right" type="source" />
      }
    </div>
  `,
  styles: `
    .wf-node {
      position: relative;
      min-width: 160px;
      max-width: 220px;
      background: color-mix(in srgb, var(--p-surface-900) 92%, transparent);
      border: 1.5px solid color-mix(in srgb, var(--node-accent) 40%, var(--p-surface-700));
      border-radius: 12px;
      padding: 10px 14px;
      font-family: 'Inter', sans-serif;
      color: var(--p-text-color, #fafafa);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;

      &.selected {
        border-color: var(--node-accent);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35),
          0 0 0 3px color-mix(in srgb, var(--node-accent) 25%, transparent);
      }
    }

    .wf-node-head {
      display: flex;
      align-items: center;
      gap: 8px;

      i {
        font-size: 0.85rem;
        color: var(--node-accent);
      }
    }

    .wf-node-label {
      font-size: 0.82rem;
      font-weight: 650;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wf-node-kind {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.6rem;
      color: var(--p-text-muted-color, #a1a1aa);
      margin-top: 2px;
    }

    .wf-node-detail {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.64rem;
      color: var(--node-accent);
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .branch-labels {
      position: absolute;
      inset: 0;
      pointer-events: none;

      .branch {
        position: absolute;
        font-size: 0.6rem;
        font-weight: 700;

        &.true {
          right: 4px;
          top: 50%;
          transform: translateY(-130%);
          color: #34d399;
        }

        &.false {
          bottom: 2px;
          left: 50%;
          transform: translateX(10px);
          color: #f87171;
        }
      }
    }
  `,
})
export class WorkflowNodeComponent
  implements NgDiagramNodeTemplate<WorkflowNodeData>
{
  readonly node = input.required<SimpleNode<WorkflowNodeData>>();

  readonly data = computed(() => this.node().data);
  readonly meta = computed(
    () =>
      KIND_META[this.data().kind] || { icon: 'pi-box', accent: '#a1a1aa' }
  );
}
