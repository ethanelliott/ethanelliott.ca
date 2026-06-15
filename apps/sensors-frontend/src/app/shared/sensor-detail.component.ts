import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { SensorStore } from '../core/sensor-store.service';
import { SensorApi } from '../core/sensor-api.service';
import { MeasurementType, Reading, SeriesPoint } from '../core/models';
import {
  METRICS,
  PRIMARY_METRIC,
  SECONDARY_METRICS,
  deviceName,
  formatValue,
  levelColorVar,
} from '../core/metrics';
import { AreaChartComponent } from './area-chart.component';
import { RangeSwitcherComponent } from './range-switcher.component';

@Component({
  selector: 'app-sensor-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AreaChartComponent, RangeSwitcherComponent],
  template: `
    @if (store.selectedReading(); as reading) {
      <div class="backdrop" (click)="store.close()"></div>
      <section class="panel" role="dialog" aria-modal="true">
        <header class="head">
          <div>
            <div class="kicker">{{ reading.device.macAddress }}</div>
            <h2>{{ name(reading.device) }}</h2>
          </div>
          <button class="close" (click)="store.close()" aria-label="Close">✕</button>
        </header>

        <div class="tabs">
          @for (m of metricList(reading); track m) {
            <button
              class="tab"
              [class.active]="m === metric()"
              (click)="metricKey.set(m)"
            >
              <span class="ic">{{ META[m].icon }}</span>{{ META[m].short }}
            </button>
          }
        </div>

        <div class="toolbar">
          <app-range-switcher [value]="hours()" (changed)="hours.set($event)" />
          @if (current(); as c) {
            <div class="now" [style.color]="color()">
              {{ c }}<span class="u">{{ META[metric()].unit }}</span>
            </div>
          }
        </div>

        @if (loading()) {
          <div class="state">Loading…</div>
        } @else {
          <app-area-chart
            [points]="points()"
            [color]="color()"
            [decimals]="META[metric()].decimals"
          />
          @if (stats(); as s) {
            <div class="stats">
              <div><span>Min</span><b>{{ s.min }}</b></div>
              <div><span>Avg</span><b>{{ s.avg }}</b></div>
              <div><span>Max</span><b>{{ s.max }}</b></div>
            </div>
          }
        }
      </section>
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 60;
        display: contents;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(3px);
        animation: fade 0.2s ease;
      }
      .panel {
        position: fixed;
        inset: auto 0 0 0;
        margin: 0 auto;
        max-width: 720px;
        max-height: 90vh;
        overflow-y: auto;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        padding: 22px clamp(16px, 4vw, 28px) 30px;
        box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.4);
        animation: rise 0.32s cubic-bezier(0.22, 1, 0.36, 1);
      }
      @media (min-width: 720px) {
        .panel {
          inset: 50% auto auto 50%;
          transform: translate(-50%, -50%);
          border-radius: var(--radius-lg);
          animation: pop 0.28s cubic-bezier(0.22, 1, 0.36, 1);
        }
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 16px;
      }
      .kicker {
        font-family: var(--font-num);
        font-size: 0.7rem;
        letter-spacing: 0.08em;
        color: var(--text-faint);
      }
      h2 {
        margin: 2px 0 0;
        font-size: 1.4rem;
        color: var(--text);
      }
      .close {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--surface-2);
        color: var(--text-dim);
        font-size: 0.9rem;
      }
      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 16px;
      }
      .tab {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        border-radius: 999px;
        background: var(--surface-2);
        border: 1px solid transparent;
        color: var(--text-dim);
        font-size: 0.8rem;
        font-weight: 600;
        transition: all 0.18s ease;
      }
      .tab .ic {
        font-size: 0.85rem;
      }
      .tab.active {
        color: var(--text);
        border-color: var(--accent);
        background: var(--surface);
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .now {
        font-family: var(--font-num);
        font-weight: 700;
        font-size: 1.6rem;
        line-height: 1;
      }
      .now .u {
        font-size: 0.55em;
        color: var(--text-dim);
        margin-left: 3px;
      }
      .state {
        height: 240px;
        display: grid;
        place-items: center;
        color: var(--text-dim);
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-top: 18px;
      }
      .stats > div {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px;
        text-align: center;
      }
      .stats span {
        display: block;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--text-faint);
        margin-bottom: 4px;
      }
      .stats b {
        font-family: var(--font-num);
        font-size: 1.2rem;
        color: var(--text);
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
      @keyframes rise {
        from {
          transform: translateY(30px);
          opacity: 0;
        }
      }
      @keyframes pop {
        from {
          transform: translate(-50%, -46%) scale(0.97);
          opacity: 0;
        }
      }
    `,
  ],
})
export class SensorDetailComponent {
  readonly store = inject(SensorStore);
  private readonly api = inject(SensorApi);

  readonly META = METRICS;
  readonly metricKey = signal<MeasurementType>('co2');
  readonly hours = signal(24);
  readonly points = signal<SeriesPoint[]>([]);
  readonly loading = signal(true);

  private reqId = 0;

  /** The effective metric, falling back to the device's primary if invalid. */
  readonly metric = computed<MeasurementType>(() => {
    const reading = this.store.selectedReading();
    if (!reading) return this.metricKey();
    const list = this.metricList(reading);
    return list.includes(this.metricKey())
      ? this.metricKey()
      : PRIMARY_METRIC[reading.device.type];
  });

  readonly stats = computed(() => {
    const vals = this.points().map((p) => p.v);
    if (!vals.length) return null;
    const d = METRICS[this.metric()].decimals;
    const f = (n: number) =>
      n.toLocaleString(undefined, {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
    return {
      min: f(Math.min(...vals)),
      max: f(Math.max(...vals)),
      avg: f(vals.reduce((a, b) => a + b, 0) / vals.length),
    };
  });

  readonly current = computed(() => {
    const p = this.points();
    if (!p.length) return null;
    return formatValue(this.metric(), p[p.length - 1].v);
  });

  readonly color = computed(() => {
    const p = this.points();
    if (!p.length) return 'var(--accent)';
    const level = METRICS[this.metric()].level(p[p.length - 1].v);
    return level === 'none' ? 'var(--accent)' : levelColorVar(level);
  });

  constructor() {
    effect(() => this.fetch());
  }

  name = deviceName;

  metricList(reading: Reading): MeasurementType[] {
    const present = new Set(reading.measurements.map((m) => m.type));
    return [PRIMARY_METRIC[reading.device.type], ...SECONDARY_METRICS].filter(
      (m) => present.has(m)
    );
  }

  private fetch(): void {
    const reading = this.store.selectedReading();
    const metric = this.metric();
    const hours = this.hours();
    if (!reading) return;
    const id = ++this.reqId;
    this.loading.set(true);
    this.api.series(reading.device.id, metric, hours, 5000).subscribe({
      next: (page) => {
        if (id !== this.reqId) return;
        this.points.set([...page.points].reverse());
        this.loading.set(false);
      },
      error: () => {
        if (id !== this.reqId) return;
        this.points.set([]);
        this.loading.set(false);
      },
    });
  }
}
