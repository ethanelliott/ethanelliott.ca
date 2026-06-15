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
import { GaugeComponent } from '../shared/gauge.component';

@Component({
  selector: 'app-nebula',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GaugeComponent],
  template: `
    <div class="stars"></div>
    <div class="wrap">
      <header class="masthead">
        <h1>ATMOS</h1>
        <div class="sub">
          <span class="live" [class.off]="store.offline()">
            <span class="b"></span>{{ store.offline() ? 'SIGNAL LOST' : 'LIVE TELEMETRY' }}
          </span>
          <span class="sync">· {{ store.updatedLabel() }}</span>
        </div>
      </header>

      <div class="grid">
        @for (r of store.readings(); track r.device.id) {
          @let p = primary(r);
          <button class="glass" (click)="store.open(r.device.id)">
            <div class="ghead">
              <span>{{ name(r.device) }}</span>
              <span class="badge" [style.color]="statusColor(r)" [style.borderColor]="statusColor(r)">
                {{ statusLabel(r) }}
              </span>
            </div>

            @if (p) {
              <div class="gauge">
                <app-gauge
                  [value]="p.value"
                  [min]="p.meta.min"
                  [max]="p.meta.max"
                  [unit]="p.meta.unit"
                  [label]="p.meta.label"
                  [display]="p.display"
                  [color]="p.color"
                />
              </div>
            }

            <div class="chips">
              @for (s of secondaries(r); track s.key) {
                <span class="chip">
                  <i>{{ s.meta.short }}</i>
                  <b>{{ s.display }}<u>{{ s.meta.unit }}</u></b>
                </span>
              }
            </div>
          </button>
        }
      </div>

      <p class="soon">Modules coming online</p>
      <div class="future">
        @for (f of future; track f.title) {
          <div class="fcard">
            <span class="fic">{{ f.icon }}</span>
            <b>{{ f.title }}</b>
            <span class="fn">{{ f.note }}</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        --gauge-glow: drop-shadow(0 0 7px color-mix(in srgb, var(--accent) 55%, transparent));
        display: block;
        position: relative;
        min-height: 100vh;
        overflow: hidden;
        color: var(--text);
        background:
          radial-gradient(70% 50% at 80% 0%, rgba(160, 107, 255, 0.25), transparent),
          radial-gradient(60% 50% at 0% 100%, rgba(59, 220, 255, 0.18), transparent),
          var(--bg);
      }
      .stars {
        position: absolute;
        inset: 0;
        background-image:
          radial-gradient(1px 1px at 20% 30%, rgba(255, 255, 255, 0.5), transparent),
          radial-gradient(1px 1px at 70% 60%, rgba(255, 255, 255, 0.35), transparent),
          radial-gradient(1.5px 1.5px at 40% 80%, rgba(255, 255, 255, 0.4), transparent),
          radial-gradient(1px 1px at 90% 20%, rgba(255, 255, 255, 0.3), transparent);
        opacity: 0.6;
        animation: drift 30s linear infinite alternate;
      }
      .wrap {
        position: relative;
        max-width: 920px;
        margin: 0 auto;
        padding: clamp(24px, 5vw, 52px) clamp(16px, 4vw, 32px) 80px;
      }
      .masthead {
        text-align: center;
        margin-bottom: 34px;
      }
      .masthead h1 {
        margin: 0;
        font-size: clamp(2.4rem, 9vw, 4rem);
        font-weight: 700;
        letter-spacing: 0.12em;
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        filter: drop-shadow(0 0 24px rgba(160, 107, 255, 0.4));
      }
      .sub {
        margin-top: 8px;
        font-size: 0.82rem;
        letter-spacing: 0.1em;
      }
      .live {
        color: var(--accent-2);
        font-weight: 600;
      }
      .live .b {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--accent-2);
        margin-right: 6px;
        box-shadow: 0 0 10px var(--accent-2);
        animation: pulse 1.8s ease-in-out infinite;
      }
      .live.off,
      .live.off .b {
        color: var(--bad);
        background: var(--bad);
        box-shadow: none;
      }
      .sync {
        color: var(--text-dim);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
      }
      .glass {
        text-align: left;
        padding: 20px;
        border-radius: var(--radius-lg);
        background: var(--surface);
        border: 1px solid var(--border);
        backdrop-filter: blur(14px);
        box-shadow: var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      .glass:hover {
        transform: translateY(-4px);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(160, 107, 255, 0.25);
      }
      .ghead {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
        font-weight: 600;
      }
      .badge {
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 3px 9px;
        border: 1px solid;
        border-radius: 999px;
      }
      .gauge {
        width: min(210px, 72%);
        margin: 8px auto 16px;
        container-type: inline-size;
      }
      .chips {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .chip {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 9px 11px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .chip i {
        font-style: normal;
        font-size: 0.66rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-faint);
      }
      .chip b {
        font-size: 1rem;
      }
      .chip u {
        text-decoration: none;
        font-size: 0.66rem;
        color: var(--text-dim);
        margin-left: 2px;
      }
      .soon {
        text-align: center;
        margin: 40px 0 16px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        font-size: 0.76rem;
        color: var(--text-dim);
      }
      .future {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 14px;
      }
      .fcard {
        text-align: center;
        padding: 22px 14px;
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        background: var(--surface);
        backdrop-filter: blur(10px);
        opacity: 0.82;
      }
      .fic {
        font-size: 1.7rem;
        display: block;
        margin-bottom: 8px;
        filter: drop-shadow(0 0 8px rgba(160, 107, 255, 0.4));
      }
      .fcard b {
        display: block;
        font-size: 0.95rem;
      }
      .fn {
        font-size: 0.76rem;
        color: var(--text-dim);
      }
      @keyframes pulse {
        50% {
          opacity: 0.4;
        }
      }
      @keyframes drift {
        to {
          transform: translateY(-14px);
        }
      }
    `,
  ],
})
export class NebulaComponent {
  readonly store = inject(SensorStore);
  readonly future = FUTURE_MODULES;

  name = deviceName;
  primary = primaryView;
  secondaries = secondaryViews;

  statusColor = (r: Parameters<typeof overallLevel>[0]) =>
    levelColorVar(overallLevel(r));
  statusLabel = (r: Parameters<typeof overallLevel>[0]) =>
    levelLabel(overallLevel(r));
}
