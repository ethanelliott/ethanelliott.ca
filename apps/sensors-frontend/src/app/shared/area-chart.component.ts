import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { SeriesPoint } from '../core/models';

interface Plot {
  line: string;
  area: string;
  lastX: number;
  lastY: number;
  yTop: number;
  yBot: number;
  gridY: number[];
}

/** Responsive SVG area/line chart for the drill-in history view. */
@Component({
  selector: 'app-area-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (plot(); as p) {
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="chart">
        @for (gy of p.gridY; track gy) {
          <line class="grid" [attr.x1]="PL" [attr.x2]="W" [attr.y1]="gy" [attr.y2]="gy" />
        }
        <path class="area" [attr.d]="p.area" [style.fill]="color()" />
        <path class="line" [attr.d]="p.line" [style.stroke]="color()" />
        <circle class="dot" [attr.cx]="p.lastX" [attr.cy]="p.lastY" [style.fill]="color()" />
      </svg>
      <div class="ylabels">
        <span>{{ hi() }}</span>
        <span>{{ lo() }}</span>
      </div>
    } @else {
      <div class="empty">No data in this range yet.</div>
    }
  `,
  styles: [
    `
      :host {
        position: relative;
        display: block;
        width: 100%;
      }
      .chart {
        display: block;
        width: 100%;
        height: 240px;
        overflow: visible;
      }
      .grid {
        stroke: var(--border);
        stroke-width: 1;
        opacity: 0.5;
        vector-effect: non-scaling-stroke;
      }
      .area {
        opacity: 0.16;
        stroke: none;
      }
      .line {
        fill: none;
        stroke-width: 2.5;
        vector-effect: non-scaling-stroke;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .dot {
        r: 4;
        stroke: var(--surface);
        stroke-width: 2;
      }
      .ylabels {
        position: absolute;
        inset: 0 auto 0 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 4px 0 28px;
        font-family: var(--font-num);
        font-size: 0.7rem;
        color: var(--text-dim);
        pointer-events: none;
      }
      .empty {
        height: 240px;
        display: grid;
        place-items: center;
        color: var(--text-dim);
        font-size: 0.9rem;
      }
    `,
  ],
})
export class AreaChartComponent {
  readonly points = input<SeriesPoint[]>([]);
  readonly color = input('var(--accent)');
  readonly decimals = input(0);

  readonly W = 600;
  readonly H = 240;
  readonly PL = 4;
  private readonly PT = 8;
  private readonly PB = 26;

  private readonly values = computed(() => this.points().map((p) => p.v));

  readonly hi = computed(() => this.fmt(Math.max(...this.values())));
  readonly lo = computed(() => this.fmt(Math.min(...this.values())));

  readonly plot = computed<Plot | null>(() => {
    const pts = this.points();
    if (pts.length < 2) return null;

    const vals = pts.map((p) => p.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;

    const x = (i: number) =>
      this.PL + (i / (pts.length - 1)) * (this.W - this.PL);
    const y = (v: number) =>
      this.PT + (1 - (v - min) / span) * (this.H - this.PT - this.PB);

    const coords = pts.map<[number, number]>((p, i) => [x(i), y(p.v)]);
    const line = coords
      .map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)} ${cy.toFixed(1)}`)
      .join(' ');
    const area = `${line} L${this.W} ${this.H - this.PB} L${this.PL} ${
      this.H - this.PB
    } Z`;

    const innerTop = this.PT;
    const innerBot = this.H - this.PB;
    const gridY = [0, 0.25, 0.5, 0.75, 1].map(
      (f) => innerTop + f * (innerBot - innerTop)
    );

    const [lastX, lastY] = coords[coords.length - 1];
    return { line, area, lastX, lastY, yTop: innerTop, yBot: innerBot, gridY };
  });

  private fmt(n: number): string {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: this.decimals(),
      maximumFractionDigits: this.decimals(),
    });
  }
}
