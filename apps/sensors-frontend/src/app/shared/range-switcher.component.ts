import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

export interface RangeOption {
  label: string;
  hours: number;
}

export const RANGES: RangeOption[] = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

@Component({
  selector: 'app-range-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ranges" role="group" aria-label="Time range">
      @for (r of ranges; track r.hours) {
        <button
          type="button"
          class="r"
          [class.active]="r.hours === value()"
          (click)="changed.emit(r.hours)"
        >
          {{ r.label }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .ranges {
        display: inline-flex;
        gap: 2px;
        padding: 3px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 999px;
      }
      .r {
        padding: 5px 14px;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        font-family: var(--font-num);
        color: var(--text-dim);
        transition: all 0.2s ease;
      }
      .r.active {
        background: var(--accent);
        color: var(--bg);
        box-shadow: var(--glow);
      }
      .r:hover:not(.active) {
        color: var(--text);
      }
    `,
  ],
})
export class RangeSwitcherComponent {
  readonly ranges = RANGES;
  readonly value = input(24);
  readonly changed = output<number>();
}
