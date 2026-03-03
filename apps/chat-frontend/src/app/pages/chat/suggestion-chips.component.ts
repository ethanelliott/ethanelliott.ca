import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-suggestion-chips',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="suggestion-chips">
      @for (suggestion of suggestions(); track suggestion) {
      <button class="chip" (click)="selectSuggestion.emit(suggestion)">
        {{ suggestion }}
      </button>
      }
    </div>
  `,
  styles: `
    .suggestion-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 16px;
      max-width: 600px;
    }

    .chip {
      background: var(--p-surface-800);
      border: 1px solid var(--p-surface-600);
      border-radius: 20px;
      padding: 8px 16px;
      font-size: 0.82rem;
      color: var(--p-text-color);
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      line-height: 1.4;

      &:hover {
        background: var(--p-surface-700);
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
      }

      &:active {
        transform: scale(0.97);
      }
    }
  `,
})
export class SuggestionChipsComponent {
  readonly suggestions = input<string[]>([
    'Explain quantum computing in simple terms',
    'Write a Python function to sort a list',
    'What are the pros and cons of microservices?',
    'Help me debug a TypeScript error',
    'Summarize the latest trends in AI',
    'Write a haiku about programming',
  ]);
  readonly selectSuggestion = output<string>();
}
