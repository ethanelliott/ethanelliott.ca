import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** Lightweight SVG sparkline. Expects values in chronological order. */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (line(); as path) {
      <svg
        [attr.viewBox]="'0 0 ' + W + ' ' + H"
        preserveAspectRatio="none"
        class="spark"
      >
        @if (fill()) {
          <path [attr.d]="area()" class="area" />
        }
        <path [attr.d]="path" class="stroke" />
      </svg>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .spark {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .stroke {
        fill: none;
        stroke: var(--spark-color, var(--accent));
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .area {
        fill: var(--spark-color, var(--accent));
        opacity: 0.14;
        stroke: none;
      }
    `,
  ],
})
export class SparklineComponent {
  readonly points = input<number[]>([]);
  readonly fill = input(false);

  readonly W = 100;
  readonly H = 32;

  private readonly coords = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return [] as Array<[number, number]>;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const pad = 3;
    return pts.map<[number, number]>((v, i) => {
      const x = (i / (pts.length - 1)) * this.W;
      const y =
        this.H - pad - ((v - min) / span) * (this.H - pad * 2);
      return [x, y];
    });
  });

  readonly line = computed(() => {
    const c = this.coords();
    if (!c.length) return '';
    return c
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
  });

  readonly area = computed(() => {
    const c = this.coords();
    if (!c.length) return '';
    const body = c
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
    return `${body} L${this.W} ${this.H} L0 ${this.H} Z`;
  });
}
