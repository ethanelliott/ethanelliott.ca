import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { RadioButtonModule } from 'primeng/radiobutton';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { StepperModule } from 'primeng/stepper';

export interface QuestionnaireQuestion {
  question: string;
  options: string[];
  allowFreeText: boolean;
}

export interface QuestionnaireRequest {
  approvalId: string;
  questions: QuestionnaireQuestion[];
  agentName?: string;
}

export interface QuestionnaireResponse {
  approvalId: string;
  answers: { question: string; answer: string }[];
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
    StepperModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="dialogHeader()"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '520px', maxWidth: '90vw' }"
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

        <!-- Progress bar -->
        @if (totalQuestions() > 1) {
        <div class="progress-section">
          <div class="progress-label">
            Question {{ currentIndex() + 1 }} of {{ totalQuestions() }}
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              [style.width.%]="progressPercent()"
            ></div>
          </div>
          <!-- Step dots -->
          <div class="step-dots">
            @for (q of request()!.questions; track $index) {
            <div
              class="step-dot"
              [class.completed]="$index < currentIndex()"
              [class.active]="$index === currentIndex()"
              [class.upcoming]="$index > currentIndex()"
            >
              @if ($index < currentIndex()) {
              <i class="pi pi-check"></i>
              } @else {
              {{ $index + 1 }}
              }
            </div>
            }
          </div>
        </div>
        }

        <div class="question-text">{{ currentQuestion()?.question }}</div>

        @if (currentHasOptions()) {
        <!-- Multiple choice mode -->
        <div class="options-list">
          @for (option of currentQuestion()!.options; track option) {
          <label
            class="option-item"
            [class.selected]="selectedOption() === option"
          >
            <p-radioButton
              [name]="'questionnaire-' + currentIndex()"
              [value]="option"
              [(ngModel)]="selectedOptionModel"
              (ngModelChange)="onOptionSelect($event)"
            />
            <span class="option-label">{{ option }}</span>
          </label>
          } @if (currentQuestion()!.allowFreeText) {
          <label
            class="option-item other-option"
            [class.selected]="selectedOption() === '__other__'"
          >
            <p-radioButton
              [name]="'questionnaire-' + currentIndex()"
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
              (keydown.enter)="onNext()"
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
          @if (currentIndex() > 0) {
          <p-button
            label="Back"
            icon="pi pi-arrow-left"
            [text]="true"
            (click)="onBack()"
          />
          }
          <div class="spacer"></div>
          @if (isLastQuestion()) {
          <p-button
            label="Submit"
            icon="pi pi-send"
            [disabled]="!canProceed()"
            (click)="onNext()"
          />
          } @else {
          <p-button
            label="Next"
            icon="pi pi-arrow-right"
            iconPos="right"
            [disabled]="!canProceed()"
            (click)="onNext()"
          />
          }
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

    .progress-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .progress-label {
      font-size: 0.78rem;
      color: var(--p-text-muted-color);
      font-weight: 500;
    }

    .progress-track {
      height: 4px;
      background: var(--p-surface-700);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--p-primary-color);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .step-dots {
      display: flex;
      gap: 8px;
      justify-content: center;
    }

    .step-dot {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 600;
      border: 2px solid var(--p-surface-600);
      color: var(--p-text-muted-color);
      background: transparent;
      transition: all 0.2s ease;

      &.completed {
        border-color: var(--p-primary-color);
        background: var(--p-primary-color);
        color: var(--p-primary-contrast-color);
      }

      &.active {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
        background: color-mix(
          in srgb,
          var(--p-primary-color) 12%,
          transparent
        );
      }

      i {
        font-size: 0.65rem;
        font-weight: 700;
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
      align-items: center;
      gap: 8px;
    }

    .spacer {
      flex: 1;
    }
  `,
})
export class QuestionnaireDialogComponent {
  readonly request = input<QuestionnaireRequest | null>(null);
  readonly respond = output<QuestionnaireResponse>();

  visible = true;
  selectedOptionModel = '';
  freeTextValue = '';

  readonly currentIndex = signal(0);
  readonly selectedOption = signal<string>('');
  readonly collectedAnswers = signal<{ question: string; answer: string }[]>(
    []
  );

  readonly totalQuestions = computed(
    () => this.request()?.questions.length ?? 0
  );

  readonly currentQuestion = computed(() => {
    const req = this.request();
    if (!req) return null;
    return req.questions[this.currentIndex()] ?? null;
  });

  readonly currentHasOptions = computed(() => {
    const q = this.currentQuestion();
    return q != null && q.options && q.options.length > 0;
  });

  readonly isLastQuestion = computed(
    () => this.currentIndex() >= this.totalQuestions() - 1
  );

  readonly progressPercent = computed(() => {
    const total = this.totalQuestions();
    if (total <= 1) return 100;
    return ((this.currentIndex() + 1) / total) * 100;
  });

  readonly dialogHeader = computed(() => {
    const total = this.totalQuestions();
    if (total <= 1) return 'Question';
    return 'Questions';
  });

  readonly canProceed = () => {
    if (!this.currentHasOptions()) {
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

  onBack(): void {
    const idx = this.currentIndex();
    if (idx <= 0) return;

    // Remove the last collected answer and restore its state
    const answers = [...this.collectedAnswers()];
    const prev = answers.pop();
    this.collectedAnswers.set(answers);
    this.currentIndex.set(idx - 1);

    // Restore previous answer state
    if (prev) {
      const q = this.request()?.questions[idx - 1];
      const hasOpts = q && q.options && q.options.length > 0;
      if (hasOpts && q!.options.includes(prev.answer)) {
        this.selectedOption.set(prev.answer);
        this.selectedOptionModel = prev.answer;
        this.freeTextValue = '';
      } else if (hasOpts) {
        // Was "Other" free text
        this.selectedOption.set('__other__');
        this.selectedOptionModel = '__other__';
        this.freeTextValue = prev.answer;
      } else {
        this.selectedOption.set('');
        this.selectedOptionModel = '';
        this.freeTextValue = prev.answer;
      }
    }
  }

  onNext(): void {
    const req = this.request();
    const q = this.currentQuestion();
    if (!req || !q || !this.canProceed()) return;

    // Collect current answer
    let answer: string;
    if (!this.currentHasOptions()) {
      answer = this.freeTextValue.trim();
    } else if (this.selectedOption() === '__other__') {
      answer = this.freeTextValue.trim();
    } else {
      answer = this.selectedOption();
    }

    const answers = [
      ...this.collectedAnswers(),
      { question: q.question, answer },
    ];

    if (this.isLastQuestion()) {
      // All done — emit
      this.respond.emit({
        approvalId: req.approvalId,
        answers,
      });
      this.resetState();
    } else {
      // Advance to next question
      this.collectedAnswers.set(answers);
      this.currentIndex.set(this.currentIndex() + 1);
      this.selectedOption.set('');
      this.selectedOptionModel = '';
      this.freeTextValue = '';
    }
  }

  private resetState(): void {
    this.visible = false;
    this.currentIndex.set(0);
    this.selectedOption.set('');
    this.selectedOptionModel = '';
    this.freeTextValue = '';
    this.collectedAnswers.set([]);
  }
}
