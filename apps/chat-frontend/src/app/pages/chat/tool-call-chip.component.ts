import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import { DisplayToolCall } from '../../models/types';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-tool-call-chip',
  standalone: true,
  imports: [ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tool-call-chip" [class.expanded]="expanded()">
      <div class="chip-header" (click)="expanded.set(!expanded())">
        <div class="chip-left">
          @switch (toolCall().status) { @case ('pending') {
          <i class="pi pi-spin pi-spinner chip-icon pending"></i>
          } @case ('success') {
          <i class="pi pi-check-circle chip-icon success"></i>
          } @case ('error') {
          <i class="pi pi-times-circle chip-icon error"></i>
          } @case ('approval-required') {
          <i class="pi pi-exclamation-circle chip-icon approval"></i>
          } }
          <span class="tool-name">{{ toolCall().name }}</span>
        </div>
        <div class="chip-right">
          @if (toolCall().durationMs) {
          <span class="duration">{{
            formatDuration(toolCall().durationMs!)
          }}</span>
          }
          <i
            class="pi"
            [class.pi-chevron-down]="!expanded()"
            [class.pi-chevron-up]="expanded()"
          ></i>
        </div>
      </div>
      @if (expanded()) {
      <div class="chip-body">
        @if (toolCall().input) {
        <div class="io-section">
          <div class="io-label">Input</div>
          <pre class="io-content">{{ formatJson(toolCall().input) }}</pre>
        </div>
        } @if (toolCall().output) {
        <div class="io-section">
          <div class="io-label">Output</div>
          <pre class="io-content">{{ truncateOutput(toolCall().output!) }}</pre>
        </div>
        } @if (toolCall().status === 'pending' && !toolCall().output) {
        <div class="io-section">
          <div class="io-label pending-label">
            <i class="pi pi-spin pi-spinner"></i>
            Running...
          </div>
        </div>
        }
      </div>
      }
    </div>
  `,
  styles: `
    .tool-call-chip {
      border: 1px solid var(--p-surface-600);
      border-radius: 8px;
      margin: 6px 0;
      overflow: hidden;
      background: var(--p-surface-900);
      font-size: 0.8rem;
    }

    .chip-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: var(--p-surface-800);
      }
    }

    .chip-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .chip-right {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--p-text-muted-color);
      font-size: 0.75rem;

      i {
        font-size: 0.7rem;
      }
    }

    .chip-icon {
      font-size: 0.85rem;

      &.pending { color: var(--p-primary-color); }
      &.success { color: #22c55e; }
      &.error { color: #ef4444; }
      &.approval { color: #f59e0b; }
    }

    .tool-name {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.78rem;
      color: var(--p-text-color);
      font-weight: 500;
    }

    .duration {
      color: var(--p-text-muted-color);
    }

    .chip-body {
      border-top: 1px solid var(--p-surface-600);
      padding: 8px 10px;
    }

    .io-section {
      margin-bottom: 8px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .io-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--p-text-muted-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .pending-label {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--p-primary-color);
      text-transform: none;
      font-weight: 500;

      i { font-size: 0.75rem; }
    }

    .io-content {
      background: var(--p-surface-950);
      border: 1px solid var(--p-surface-700);
      border-radius: 6px;
      padding: 8px;
      margin: 0;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.72rem;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--p-text-color);
      max-height: 200px;
      overflow-y: auto;
    }
  `,
})
export class ToolCallChipComponent {
  readonly toolCall = input.required<DisplayToolCall>();
  expanded = signal(false);

  formatJson(obj: Record<string, unknown> | undefined): string {
    if (!obj) return '';
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  truncateOutput(output: string): string {
    const maxLen = 2000;
    if (output.length <= maxLen) return output;
    return output.slice(0, maxLen) + '\n... (truncated)';
  }
}
