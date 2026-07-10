import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

interface Suggestion {
  icon: string;
  title: string;
  prompt: string;
  accent: string;
}

/** Suggestion cards tuned to the gateway's agents (artifacts, research, weather, math…). */
const DEFAULT_SUGGESTIONS: Suggestion[] = [
  {
    icon: 'pi-palette',
    title: 'Build something',
    prompt: 'Build me an interactive particle simulation I can play with',
    accent: '#a78bfa',
  },
  {
    icon: 'pi-globe',
    title: 'Research',
    prompt: 'Search the web for the latest developments in local LLMs',
    accent: '#22d3ee',
  },
  {
    icon: 'pi-sun',
    title: 'Weather',
    prompt: "What's the weather looking like this week?",
    accent: '#fbbf24',
  },
  {
    icon: 'pi-calculator',
    title: 'Calculate',
    prompt: 'If I invest $500/month at 7% annual return, what do I have in 20 years?',
    accent: '#34d399',
  },
  {
    icon: 'pi-code',
    title: 'Code',
    prompt: 'Write a TypeScript function that debounces async calls',
    accent: '#f472b6',
  },
  {
    icon: 'pi-book',
    title: 'Explain',
    prompt: 'Explain how transformers work, with an analogy',
    accent: '#818cf8',
  },
];

@Component({
  selector: 'app-suggestion-chips',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="suggestion-grid">
      @for (s of suggestions(); track s.title) {
      <button
        class="suggestion-card"
        (click)="selectSuggestion.emit(s.prompt)"
        [style.--card-accent]="s.accent"
      >
        <i class="pi card-icon" [class]="'pi card-icon ' + s.icon"></i>
        <span class="card-title">{{ s.title }}</span>
        <span class="card-prompt">{{ s.prompt }}</span>
      </button>
      }
    </div>
  `,
  styles: `
    .suggestion-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 28px;
      width: 100%;
      max-width: 680px;
    }

    .suggestion-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      text-align: left;
      background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
      border: 1px solid var(--p-surface-800);
      border-radius: var(--chat-radius-md);
      padding: 14px;
      cursor: pointer;
      font-family: inherit;
      color: var(--p-text-color);
      transition: border-color 0.15s ease, background 0.15s ease,
        transform 0.1s ease;

      &:hover {
        border-color: color-mix(in srgb, var(--card-accent) 50%, transparent);
        background: color-mix(in srgb, var(--card-accent) 6%, var(--p-surface-900));

        .card-icon {
          transform: scale(1.1);
        }
      }

      &:active {
        transform: scale(0.98);
      }
    }

    .card-icon {
      font-size: 1rem;
      color: var(--card-accent);
      transition: transform 0.15s ease;
    }

    .card-title {
      font-size: 0.82rem;
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    .card-prompt {
      font-size: 0.72rem;
      line-height: 1.45;
      color: var(--p-text-muted-color);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    @media (max-width: 640px) {
      .suggestion-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .suggestion-card:nth-child(n + 5) {
        display: none;
      }
    }
  `,
})
export class SuggestionChipsComponent {
  readonly suggestions = input<Suggestion[]>(DEFAULT_SUGGESTIONS);
  readonly selectSuggestion = output<string>();
}
