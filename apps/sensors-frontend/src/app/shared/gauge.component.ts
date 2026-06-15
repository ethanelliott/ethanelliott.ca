import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** Radial gauge (270° sweep) with the value rendered in the centre. */
@Component({
  selector: 'app-gauge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 100 100" class="g">
      <circle class="track" cx="50" cy="50" [attr.r]="R" />
      <circle
        class="value"
        cx="50"
        cy="50"
        [attr.r]="R"
        [attr.stroke-dasharray]="dash()"
        [attr.stroke-dashoffset]="offset()"
        [style.stroke]="color()"
      />
    </svg>
    <div class="center">
      <div class="val" [style.color]="color()">
        {{ display() }}<span class="unit">{{ unit() }}</span>
      </div>
      <div class="label">{{ label() }}</div>
    </div>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-grid;
        place-items: center;
        aspect-ratio: 1;
        width: 100%;
      }
      .g {
        width: 100%;
        height: 100%;
        transform: rotate(135deg);
        overflow: visible;
        filter: var(--gauge-glow, none);
      }
      .track {
        fill: none;
        stroke: var(--border);
        stroke-width: 8;
        stroke-linecap: round;
        opacity: 0.7;
      }
      .value {
        fill: none;
        stroke-width: 8;
        stroke-linecap: round;
        transition:
          stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1),
          stroke 0.4s ease;
      }
      .center {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        text-align: center;
        gap: 2px;
      }
      .val {
        font-family: var(--font-num);
        font-weight: 700;
        font-size: clamp(1.3rem, 5cqw, 2.1rem);
        line-height: 1;
        letter-spacing: -0.02em;
      }
      .unit {
        font-size: 0.5em;
        margin-left: 2px;
        color: var(--text-dim);
        font-weight: 600;
      }
      .label {
        font-size: 0.72rem;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
    `,
  ],
})
export class GaugeComponent {
  readonly value = input(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly unit = input('');
  readonly label = input('');
  readonly display = input('');
  readonly color = input('var(--accent)');

  readonly R = 40;
  /** 270° of the circumference is drawable; the rest is the bottom gap. */
  private readonly circ = 2 * Math.PI * this.R;
  private readonly sweep = this.circ * 0.75;

  readonly dash = computed(() => `${this.sweep} ${this.circ}`);

  readonly offset = computed(() => {
    const frac = Math.max(
      0,
      Math.min(1, (this.value() - this.min()) / (this.max() - this.min() || 1))
    );
    return this.sweep * (1 - frac);
  });
}
