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
  selector: 'app-hearth',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GaugeComponent],
  template: `
    <div class="wrap">
      <header class="hello">
        <h1>{{ greeting() }}</h1>
        <p>
          Your home feels
          <b [style.color]="moodColor()">{{ mood() }}</b>
          · updated {{ store.updatedLabel() }}
        </p>
      </header>

      <div class="grid">
        @for (r of store.readings(); track r.device.id) {
          @let p = primary(r);
          <button class="card" (click)="store.open(r.device.id)">
            <div class="title">
              <span class="emoji">{{ p?.meta?.icon }}</span>
              {{ name(r.device) }}
            </div>

            @if (p) {
              <div class="gauge">
                <app-gauge
                  [value]="p.value"
                  [min]="p.meta.min"
                  [max]="p.meta.max"
                  [unit]="p.meta.unit"
                  [label]="statusLabel(r)"
                  [display]="p.display"
                  [color]="p.color"
                />
              </div>
            }

            <div class="pills">
              @for (s of secondaries(r); track s.key) {
                <span class="pill">
                  <span class="pic">{{ s.meta.icon }}</span>
                  <span class="pv">{{ s.display }}<i>{{ s.meta.unit }}</i></span>
                </span>
              }
            </div>
          </button>
        }
      </div>

      <p class="soon">More of your home, coming soon</p>
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
        display: block;
        min-height: 100vh;
        background:
          radial-gradient(90% 60% at 100% 0%, color-mix(in srgb, var(--accent-2) 16%, transparent), transparent),
          radial-gradient(80% 60% at 0% 100%, color-mix(in srgb, var(--accent) 12%, transparent), transparent),
          var(--bg);
        color: var(--text);
      }
      .wrap {
        max-width: 860px;
        margin: 0 auto;
        padding: clamp(24px, 5vw, 52px) clamp(16px, 4vw, 32px) 80px;
      }
      .hello {
        margin-bottom: 30px;
      }
      .hello h1 {
        margin: 0;
        font-size: clamp(1.8rem, 6vw, 2.6rem);
        font-weight: 700;
      }
      .hello p {
        margin: 6px 0 0;
        color: var(--text-dim);
        font-size: 1rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
      }
      .card {
        text-align: center;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 24px 22px;
        box-shadow: var(--shadow);
        transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .card:hover {
        transform: translateY(-4px) scale(1.012);
      }
      .title {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-weight: 700;
        font-size: 1.05rem;
        margin-bottom: 6px;
      }
      .emoji {
        font-size: 1.1rem;
      }
      .gauge {
        width: min(220px, 70%);
        margin: 6px auto 16px;
        container-type: inline-size;
      }
      .pills {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 13px;
        background: var(--surface-2);
        border-radius: 999px;
        font-size: 0.84rem;
        font-weight: 600;
      }
      .pic {
        font-size: 0.9rem;
      }
      .pv i {
        font-style: normal;
        color: var(--text-faint);
        font-weight: 500;
        font-size: 0.74rem;
        margin-left: 2px;
      }
      .soon {
        margin: 40px 0 16px;
        text-align: center;
        color: var(--text-dim);
        font-weight: 600;
      }
      .future {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 14px;
      }
      .fcard {
        text-align: center;
        padding: 22px 14px;
        border-radius: var(--radius-lg);
        background: var(--surface-2);
        border: 1px solid var(--border);
        opacity: 0.78;
      }
      .fic {
        font-size: 1.8rem;
        display: block;
        margin-bottom: 8px;
      }
      .fcard b {
        display: block;
        font-size: 0.96rem;
      }
      .fn {
        font-size: 0.78rem;
        color: var(--text-dim);
      }
    `,
  ],
})
export class HearthComponent {
  readonly store = inject(SensorStore);
  readonly future = FUTURE_MODULES;

  name = deviceName;
  primary = primaryView;
  secondaries = secondaryViews;

  statusLabel = (r: Parameters<typeof overallLevel>[0]) =>
    levelLabel(overallLevel(r));

  greeting(): string {
    const h = new Date().getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  /** Worst level across devices → an overall mood word. */
  private worst() {
    const rank = { none: 0, good: 1, ok: 2, bad: 3 } as const;
    let worst: 'none' | 'good' | 'ok' | 'bad' = 'good';
    for (const r of this.store.readings()) {
      const l = overallLevel(r);
      if (rank[l] > rank[worst]) worst = l;
    }
    return worst;
  }

  mood(): string {
    return { none: 'calm', good: 'fresh', ok: 'okay', bad: 'stuffy' }[
      this.worst()
    ];
  }

  moodColor(): string {
    return levelColorVar(this.worst());
  }
}
