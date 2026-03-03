import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';

export interface ApprovalRequest {
  approvalId: string;
  tool: string;
  input: Record<string, unknown>;
  message?: string;
  agentName?: string;
}

export interface ApprovalResponse {
  approvalId: string;
  approved: boolean;
  rejectionReason?: string;
}

@Component({
  selector: 'app-approval-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, TextareaModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="'Tool Approval Required'"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '500px', maxWidth: '90vw' }"
      [closable]="false"
      [draggable]="false"
    >
      @if (request()) {
      <div class="approval-content">
        @if (request()!.agentName) {
        <div class="agent-badge">
          <i class="pi pi-user"></i>
          <span>{{ request()!.agentName }}</span>
        </div>
        }
        <div class="tool-info">
          <div class="tool-label">Tool</div>
          <div class="tool-name">{{ request()!.tool }}</div>
        </div>
        @if (request()!.message) {
        <div class="message-section">
          <p>{{ request()!.message }}</p>
        </div>
        }
        <div class="input-section">
          <div class="input-label">Parameters</div>
          <pre class="input-content">{{ formatJson(request()!.input) }}</pre>
        </div>
        <div class="rejection-section">
          <label for="rejection-reason">Rejection reason (optional)</label>
          <textarea
            pTextarea
            id="rejection-reason"
            [(ngModel)]="rejectionReason"
            [autoResize]="true"
            [rows]="2"
            placeholder="Explain why you're rejecting this tool call..."
          ></textarea>
        </div>
      </div>
      }
      <ng-template #footer>
        <div class="dialog-footer">
          <p-button
            label="Reject"
            icon="pi pi-times"
            severity="danger"
            [outlined]="true"
            (click)="onReject()"
          />
          <p-button
            label="Approve"
            icon="pi pi-check"
            severity="success"
            (click)="onApprove()"
          />
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .approval-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .agent-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
      border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, transparent);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.8rem;
      color: var(--p-primary-color);
      font-weight: 500;
      width: fit-content;

      i { font-size: 0.75rem; }
    }

    .tool-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tool-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--p-text-muted-color);
      text-transform: uppercase;
    }

    .tool-name {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--p-text-color);
    }

    .message-section {
      padding: 8px 12px;
      background: var(--p-surface-800);
      border-radius: 8px;
      font-size: 0.85rem;
      color: var(--p-text-color);

      p { margin: 0; }
    }

    .input-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--p-text-muted-color);
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .input-content {
      background: var(--p-surface-900);
      border: 1px solid var(--p-surface-600);
      border-radius: 6px;
      padding: 10px;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.78rem;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--p-text-color);
      margin: 0;
      max-height: 250px;
      overflow-y: auto;
    }

    .rejection-section {
      label {
        display: block;
        font-size: 0.8rem;
        color: var(--p-text-muted-color);
        margin-bottom: 4px;
      }
    }

    .dialog-footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
  `,
})
export class ApprovalDialogComponent {
  readonly request = input<ApprovalRequest | null>(null);
  readonly approve = output<ApprovalResponse>();

  visible = true;
  rejectionReason = '';

  formatJson(obj: Record<string, unknown>): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  onApprove(): void {
    const req = this.request();
    if (!req) return;
    this.approve.emit({
      approvalId: req.approvalId,
      approved: true,
    });
    this.visible = false;
    this.rejectionReason = '';
  }

  onReject(): void {
    const req = this.request();
    if (!req) return;
    this.approve.emit({
      approvalId: req.approvalId,
      approved: false,
      rejectionReason: this.rejectionReason || undefined,
    });
    this.visible = false;
    this.rejectionReason = '';
  }
}
