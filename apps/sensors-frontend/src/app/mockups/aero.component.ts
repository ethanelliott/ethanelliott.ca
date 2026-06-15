import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SensorStore } from '../core/sensor-store.service';
import {
  FUTURE_MODULES,
  deviceName,
  levelLabel,
  overallLevel,
  levelColorVar,
  primaryView,
  secondaryViews,
} from '../core/metrics';
import { SparklineComponent } from '../shared/sparkline.component';

@Component({
  selector: 'app-aero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SparklineComponent],
  template: `
    <div class="wrap">
      <header class="top">
        <div>
          <p class="eyebrow">elliott.haus</p>
          <h1>Air</h1>
        </div>
        <div class="fresh" [class.off]="store.offline()">
          <span class="dot"></span>
          {{ store.offline() ? 'offline' : 'updated ' + store.updatedLabel() }}
        </div>
      </header>

      <div class="grid">
        @for (r of store.readings(); track r.device.id) {
          @let p = primary(r);
          <button class="card" (click)="store.open(r.device.id)">
            <div class="chead">
              <span class="name">{{ name(r.device) }}</span>
              <span class="status" [style.color]="statusColor(r)">
                <span class="sdot" [style.background]="statusColor(r)"></span>
                {{ statusLabel(r) }}
              </span>
            </div>

            @if (p) {
              <div class="primary" [style.color]="p.color">
                {{ p.display }}<span class="unit">{{ p.meta.unit }}</span>
              </div>
            }

            <div class="spark" [style.--spark-color]="p?.color ?? 'var(--accent)'">
              <app-sparkline [points]="spark(r.device.id)" [fill]="true" />
            </div>

            <div class="chips">
              @for (s of secondaries(r); track s.key) {
                <span class="chip">
                  <span class="cic">{{ s.meta.icon }}</span>
                  <b>{{ s.display }}</b><i>{{ s.meta.unit }}</i>
                </span>
              }
            </div>
          </button>
        }
      </div>

      <p class="section">Coming soon</p>
      <div class="future">
        @for (f of future; track f.title) {
          <div class="fcard">
            <span class="fic">{{ f.icon }}</span>
            <div>
              <b>{{ f.title }}</b>
              <span>{{ f.note }}</span>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: radial-gradient(120% 90% at 50% -10%, var(--bg-2), var(--bg));
        color: var(--text);
      }
      .wrap {
        max-width: 880px;
        margin: 0 auto;
        padding: clamp(20px, 5vw, 48px) clamp(16px, 4vw, 32px) 80px;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 28px;
      }
      .eyebrow {
        margin: 0;
        font-size: 0.78rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-faint);
      }
      h1 {
        margin: 4px 0 0;
        font-size: clamp(2rem, 7vw, 3rem);
        font-weight: 600;
        letter-spacing: -0.03em;
      }
      .fresh {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 0.82rem;
        color: var(--text-dim);
      }
      .fresh .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--good);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--good) 22%, transparent);
        animation: pulse 2.4s ease-in-out infinite;
      }
      .fresh.off .dot {
        background: var(--bad);
        box-shadow: none;
        animation: none;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
      }
      .card {
        text-align: left;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 22px;
        box-shadow: var(--shadow);
        transition: transform 0.25s ease, box-shadow 0.25s ease;
      }
      .card:hover {
        transform: translateY(-3px);
        box-shadow: 0 16px 40px rgba(20, 34, 46, 0.12);
      }
      .chead {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
      }
      .name {
        font-weight: 600;
        font-size: 1.02rem;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.76rem;
        font-weight: 600;
      }
      .sdot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .primary {
        font-size: 3.2rem;
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.03em;
      }
      .primary .unit {
        font-size: 0.9rem;
        color: var(--text-dim);
        margin-left: 5px;
        font-weight: 600;
      }
      .spark {
        height: 38px;
        margin: 14px 0 16px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        padding: 6px 10px;
        background: var(--surface-2);
        border-radius: 999px;
        font-size: 0.82rem;
      }
      .chip .cic {
        font-size: 0.8rem;
      }
      .chip b {
        font-weight: 600;
      }
      .chip i {
        font-style: normal;
        color: var(--text-faint);
        font-size: 0.72rem;
      }
      .section {
        margin: 38px 0 14px;
        font-size: 0.78rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-faint);
      }
      .future {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }
      .fcard {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border: 1px dashed var(--border);
        border-radius: var(--radius);
        opacity: 0.62;
      }
      .fic {
        font-size: 1.4rem;
      }
      .fcard b {
        display: block;
        font-size: 0.92rem;
      }
      .fcard span {
        font-size: 0.78rem;
        color: var(--text-dim);
      }
      @keyframes pulse {
        50% {
          opacity: 0.55;
        }
      }
    `,
  ],
})
export class AeroComponent {
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
}
