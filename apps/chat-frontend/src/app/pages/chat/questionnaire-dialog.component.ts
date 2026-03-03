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
import { RadioButtonModule } from 'primeng/radiobutton';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

export interface QuestionnaireRequest {
  approvalId: string;
  question: string;
  options: string[];
  allowFreeText: boolean;
  agentName?: string;
}

export interface QuestionnaireResponse {
  approvalId: string;
  answer: string;
}

@Component({
  selector: 'app-questionnaire-dialog',
  standalone: true,
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    RadioButtonModule,
    InputTextModule,
    TextareaModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="'Question'"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '480px', maxWidth: '90vw' }"
      [closable]="false"
      [draggable]="false"
    >
      @if (request()) {
      <div class="questionnaire-content">
        @if (request()!.agentName) {
        <div class="agent-badge">
          <i class="pi pi-sparkles"></i>
          <span>{{ request()!.agentName }}</span>
        </div>
        }
        <div class="question-text">{{ request()!.question }}</div>
        @if (hasOptions()) {
        <!-- Multiple choice mode -->
        <div class="options-list">
          @for (option of request()!.options; track option) {
          <label
            class="option-item"
            [class.selected]="selectedOption() === option"
          >
            <p-radioButton
              [name]="'questionnaire'"
              [value]="option"
              [(ngModel)]="selectedOptionModel"
              (ngModelChange)="onOptionSelect($event)"
            />
            <span class="option-label">{{ option }}</span>
          </label>
          } @if (request()!.allowFreeText) {
          <label
            class="option-item other-option"
            [class.selected]="selectedOption() === '__other__'"
          >
            <p-radioButton
              [name]="'questionnaire'"
              [value]="'__other__'"
              [(ngModel)]="selectedOptionModel"
              (ngModelChange)="onOptionSelect($event)"
            />
            <span class="option-label">Other</span>
          </label>
          @if (selectedOption() === '__other__') {
          <div class="free-text-wrapper">
            <input
              pInputText
              [(ngModel)]="freeTextValue"
              placeholder="Type your answer..."
              class="free-text-input"
              (keydown.enter)="onSubmit()"
            />
          </div>
          } }
        </div>
        } @else {
        <!-- Open-ended text mode -->
        <div class="open-ended-wrapper">
          <textarea
            pTextarea
            [(ngModel)]="freeTextValue"
            placeholder="Type your answer..."
            [autoResize]="true"
            [rows]="3"
            class="open-ended-input"
          ></textarea>
        </div>
        }
      </div>
      }
      <ng-template #footer>
        <div class="dialog-footer">
          <p-button
            label="Submit"
            icon="pi pi-send"
            [disabled]="!canSubmit()"
            (click)="onSubmit()"
          />
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .questionnaire-content {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .agent-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: color-mix(
        in srgb,
        var(--p-primary-color) 15%,
        transparent
      );
      border: 1px solid
        color-mix(in srgb, var(--p-primary-color) 30%, transparent);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.8rem;
      color: var(--p-primary-color);
      font-weight: 500;
      width: fit-content;

      i {
        font-size: 0.75rem;
      }
    }

    .question-text {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--p-text-color);
      line-height: 1.5;
    }

    .options-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .option-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border: 1px solid var(--p-surface-600);
      border-radius: 8px;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;

      &:hover {
        background: var(--p-surface-800);
        border-color: var(--p-surface-500);
      }

      &.selected {
        border-color: var(--p-primary-color);
        background: color-mix(
          in srgb,
          var(--p-primary-color) 10%,
          transparent
        );
      }
    }

    .option-label {
      font-size: 0.88rem;
      color: var(--p-text-color);
    }

    .free-text-wrapper {
      padding-left: 36px;
      margin-top: -2px;
    }

    .free-text-input {
      width: 100%;
    }

    .open-ended-wrapper {
      margin-top: 2px;
    }

    .open-ended-input {
      width: 100%;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class QuestionnaireDialogComponent {
  readonly request = input<QuestionnaireRequest | null>(null);
  readonly respond = output<QuestionnaireResponse>();

  visible = true;
  selectedOptionModel = '';
  freeTextValue = '';

  readonly selectedOption = signal<string>('');

  readonly hasOptions = () => {
    const req = this.request();
    return req && req.options && req.options.length > 0;
  };

  readonly canSubmit = () => {
    if (!this.hasOptions()) {
      return this.freeTextValue.trim().length > 0;
    }
    const sel = this.selectedOption();
    if (!sel) return false;
    if (sel === '__other__') return this.freeTextValue.trim().length > 0;
    return true;
  };

  onOptionSelect(value: string): void {
    this.selectedOption.set(value);
  }

  onSubmit(): void {
    const req = this.request();
    if (!req || !this.canSubmit()) return;

    let answer: string;
    if (!this.hasOptions()) {
      answer = this.freeTextValue.trim();
    } else if (this.selectedOption() === '__other__') {
      answer = this.freeTextValue.trim();
    } else {
      answer = this.selectedOption();
    }

    this.respond.emit({
      approvalId: req.approvalId,
      answer,
    });
    this.visible = false;
    this.selectedOption.set('');
    this.selectedOptionModel = '';
    this.freeTextValue = '';
  }
}
