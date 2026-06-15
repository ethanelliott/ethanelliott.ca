import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SensorStore } from '../core/sensor-store.service';
import {
  FUTURE_MODULES,
  MetricView,
  deviceName,
  levelLabel,
  overallLevel,
  levelColorVar,
  primaryView,
  secondaryViews,
} from '../core/metrics';
import { SparklineComponent } from '../shared/sparkline.component';

@Component({
  selector: 'app-console',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SparklineComponent],
  template: `
    <div class="wrap">
      <header class="bar">
        <span class="brand">SENSORS<i>//</i>AIR</span>
        <span class="meta">{{ store.readings().length }} NODES</span>
        <span class="meta">SYNC {{ store.updatedLabel() }}</span>
        <span class="live" [class.off]="store.offline()">
          <span class="b"></span>{{ store.offline() ? 'NO LINK' : 'LIVE' }}
        </span>
      </header>

      <div class="grid">
        @for (r of store.readings(); track r.device.id) {
          @let p = primary(r);
          <button class="panel" (click)="store.open(r.device.id)">
            <div class="phead">
              <span class="tag" [style.color]="statusColor(r)">
                [{{ r.device.type }}]
              </span>
              <span class="mac">{{ r.device.macAddress }}</span>
              <span class="lvl" [style.color]="statusColor(r)">
                {{ statusLabel(r) }}
              </span>
            </div>

            @if (p) {
              <div class="readout">
                <span class="big" [style.color]="p.color">{{ p.display }}</span>
                <span class="u">{{ p.meta.unit }}</span>
              </div>
            }

            <div class="spark" [style.--spark-color]="p?.color ?? 'var(--accent)'">
              <app-sparkline [points]="spark(r.device.id)" [fill]="true" />
            </div>

            <div class="rows">
              @for (s of secondaries(r); track s.key) {
                <div class="row">
                  <span class="k">{{ s.meta.short }}</span>
                  <span class="v">{{ s.display }}<i>{{ s.meta.unit }}</i></span>
                  <span class="meter">
                    <span class="fill" [style.width.%]="pct(s)" [style.background]="s.color"></span>
                  </span>
                </div>
              }
            </div>
          </button>
        }

        <div class="panel modules">
          <div class="phead"><span class="tag">[modules]</span><span class="mac">queued</span></div>
          @for (f of future; track f.title) {
            <div class="mrow">
              <span>&gt; {{ f.title.toLowerCase() }}</span>
              <span class="dots"></span>
              <span class="pend">pending</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background:
          linear-gradient(var(--border) 1px, transparent 1px) 0 0 / 100% 34px,
          var(--bg);
        background-blend-mode: overlay;
        color: var(--text);
        font-family: var(--font);
      }
      .wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding: 18px clamp(12px, 3vw, 28px) 70px;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 10px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        margin-bottom: 18px;
        font-size: 0.76rem;
        letter-spacing: 0.05em;
      }
      .brand {
        font-weight: 700;
        color: var(--text);
      }
      .brand i {
        color: var(--accent);
        font-style: normal;
      }
      .meta {
        color: var(--text-dim);
      }
      .live {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--accent);
        font-weight: 700;
      }
      .live .b {
        width: 8px;
        height: 8px;
        background: var(--accent);
        box-shadow: var(--glow);
        animation: blink 1.3s steps(2) infinite;
      }
      .live.off {
        color: var(--bad);
      }
      .live.off .b {
        background: var(--bad);
        box-shadow: none;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 14px;
      }
      .panel {
        text-align: left;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
        padding: 14px 16px 16px;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .panel:hover {
        border-color: var(--accent);
        box-shadow: var(--glow);
      }
      .phead {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.72rem;
        padding-bottom: 10px;
        border-bottom: 1px dashed var(--border);
        margin-bottom: 12px;
      }
      .tag {
        font-weight: 700;
        text-transform: uppercase;
      }
      .mac {
        color: var(--text-faint);
      }
      .lvl {
        margin-left: auto;
        text-transform: uppercase;
        font-weight: 700;
      }
      .readout {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      .big {
        font-size: 2.8rem;
        font-weight: 700;
        line-height: 1;
      }
      .u {
        color: var(--text-dim);
        font-size: 0.85rem;
      }
      .spark {
        height: 34px;
        margin: 10px 0 14px;
      }
      .rows {
        display: grid;
        gap: 7px;
      }
      .row {
        display: grid;
        grid-template-columns: 48px 84px 1fr;
        align-items: center;
        gap: 10px;
        font-size: 0.78rem;
      }
      .k {
        color: var(--text-dim);
        text-transform: uppercase;
      }
      .v {
        color: var(--text);
        font-weight: 700;
      }
      .v i {
        color: var(--text-faint);
        font-style: normal;
        font-weight: 400;
        margin-left: 2px;
      }
      .meter {
        height: 6px;
        background: var(--surface-2);
        border-radius: 2px;
        overflow: hidden;
      }
      .fill {
        display: block;
        height: 100%;
        transition: width 0.8s ease;
      }
      .modules {
        opacity: 0.72;
      }
      .mrow {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.78rem;
        color: var(--text-dim);
        padding: 4px 0;
      }
      .mrow .dots {
        flex: 1;
        border-bottom: 1px dotted var(--border);
      }
      .pend {
        color: var(--accent-2);
      }
      @keyframes blink {
        50% {
          opacity: 0.2;
        }
      }
    `,
  ],
})
export class ConsoleComponent {
  readonly store = inject(SensorStore);
  readonly future = FUTURE_MODULES;

  name = deviceName;
  primary = primaryView;
  secondaries = secondaryViews;

  spark = (id: string): number[] => this.store.recent()[id] ?? [];

  statusColor = (r: Parameters<typeof overallLevel>[0]) =>
    levelColorVar(overallLevel(r));
  statusLabel = (r: Parameters<typeof overallLevel>[0]) =>
    levelLabel(overallLevel(r));

  pct(view: MetricView): number {
    const { min, max } = view.meta;
    return Math.max(
      3,
      Math.min(100, ((view.value - min) / (max - min || 1)) * 100)
    );
  }
}
