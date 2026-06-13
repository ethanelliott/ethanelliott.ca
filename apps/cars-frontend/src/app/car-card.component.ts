import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ScorecardService } from './scorecard.service';
import { CATS, PIP_RANGE } from './data';
import type { Car } from './models';

@Component({
  selector: 'app-car-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = car();
    @let cs = svc.state().cars[c.id];
    @let score = svc.compute(c.id);

    <div class="card" [style.--accent]="c.color">
      <div class="car-head">
        <div class="car-brand">{{ c.brand }}</div>
        <h2 class="car-name">{{ c.name }}</h2>
        <div class="car-tag">{{ c.tag }}</div>
        <div class="scoreline">
          <span class="scorebig">{{ score.pts }}</span>
          <span class="scoreunit">PTS · {{ score.rated }}/{{ cats.length }} RATED</span>
          <span class="scorepct">{{ score.pct }}%</span>
        </div>
      </div>

      <div class="specs">
        @for (entry of specEntries(c); track entry.key) {
          <div class="chip">
            <span class="k">{{ entry.key }}</span>
            <span class="v">{{ entry.value }}</span>
          </div>
        }
      </div>

      <div class="feel"><b>On the drive:</b> {{ c.feel }}</div>

      @if (c.watch) {
        <div class="watch">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18.3A2 2 0 0 0 3.5 21.3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              stroke="#b5780f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>{{ c.watch }}</span>
        </div>
      }

      <div class="price-row">
        <label for="price-{{ c.id }}">Out-the-door price (CAD)</label>
        <div class="sub">The number that matters: car + all fees + tax.</div>
        <div class="price-field">
          <span>$</span>
          <input [id]="'price-' + c.id" inputmode="numeric" placeholder="e.g. 46,500"
                 [value]="cs.price"
                 (input)="onPrice($event, c.id)" />
        </div>
      </div>

      @for (cat of cats; track cat.id) {
        @let s = cs.scores[cat.id];
        @let w = cs.weights[cat.id];
        <div class="cat">
          <div class="cat-top">
            <span class="cat-name">{{ cat.name }}</span>
            <span class="x2" [class.x2--on]="w === 2">×2</span>
            <button class="star" [class.star--on]="w === 2"
                    (click)="svc.toggleWeight(c.id, cat.id)"
                    [attr.aria-pressed]="w === 2"
                    aria-label="Mark as matters more">
              {{ w === 2 ? '★' : '☆' }}
            </button>
          </div>
          <div class="cat-hint">{{ cat.hint }}</div>
          <div class="pips">
            @for (n of pips; track n) {
              <button class="pip"
                      [class.pip--fill]="n <= s"
                      [class.pip--sel]="n === s"
                      (click)="svc.setScore(c.id, cat.id, n)"
                      [attr.aria-label]="n + ' out of 5'">{{ n }}</button>
            }
          </div>
          <div class="scale-key"><span>1 · Poor</span><span>5 · Love it</span></div>
        </div>
      }

      <div class="notes-row">
        <label [for]="'notes-' + c.id">Quick notes on this one</label>
        <textarea [id]="'notes-' + c.id"
                  placeholder="Anything that stood out — a smell, a rattle, the salesperson, a feature you loved…"
                  [value]="cs.notes"
                  (input)="onNotes($event, c.id)"></textarea>
      </div>
    </div>
  `,
  styles: [`
    .card {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .car-head {
      padding: 16px 16px 14px;
      border-bottom: 1px solid var(--line-2);
      position: relative;
    }
    .car-head::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 5px;
      background: var(--accent);
    }
    .car-name { font-family: 'Saira Condensed', sans-serif; font-weight: 700; font-size: 25px; line-height: 1; text-transform: uppercase; margin: 0; color: var(--accent); }
    .car-brand { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--faint); }
    .car-tag { font-size: 12.5px; color: var(--soft); margin-top: 5px; }

    .scoreline { display: flex; align-items: baseline; gap: 10px; margin-top: 13px; }
    .scorebig { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 30px; line-height: 1; color: var(--ink); }
    .scoreunit { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--faint); letter-spacing: .06em; }
    .scorepct { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--soft); }

    .specs { display: flex; flex-wrap: wrap; gap: 6px; padding: 13px 16px; background: #FAFBFA; border-bottom: 1px solid var(--line-2); }
    .chip { border: 1px solid var(--line); border-radius: 9px; padding: 6px 9px; background: #fff; min-width: 0; }
    .chip .k { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); display: block; }
    .chip .v { font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 12.5px; color: var(--ink); white-space: nowrap; }

    .feel { padding: 11px 16px; font-size: 12.5px; color: var(--soft); border-bottom: 1px solid var(--line-2); }
    .feel b { color: var(--ink); font-weight: 600; }

    .watch { padding: 10px 16px; font-size: 12px; color: #8a5a12; background: #FDF6EA; border-bottom: 1px solid var(--line-2); display: flex; gap: 7px; }
    .watch svg { flex: 0 0 auto; margin-top: 1px; }

    .price-row { padding: 14px 16px; border-bottom: 1px solid var(--line-2); }
    .price-row label { font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 3px; }
    .price-row .sub { font-size: 11.5px; color: var(--faint); margin-bottom: 8px; }
    .price-field { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #fff; }
    .price-field span { padding: 0 10px; font-family: 'JetBrains Mono', monospace; color: var(--soft); border-right: 1px solid var(--line-2); align-self: stretch; display: flex; align-items: center; }
    .price-field input { border: 0; outline: 0; padding: 11px 12px; font-family: 'JetBrains Mono', monospace; font-size: 16px; width: 100%; background: transparent; color: var(--ink); }
    .price-field:focus-within { border-color: var(--accent); }

    .cat { padding: 14px 16px; border-bottom: 1px solid var(--line-2); }
    .cat:last-of-type { border-bottom: 0; }
    .cat-top { display: flex; align-items: center; gap: 10px; }
    .cat-name { font-size: 14.5px; font-weight: 600; flex: 1; }

    .x2 { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--accent); margin-left: 2px; align-self: center; visibility: hidden; }
    .x2--on { visibility: visible; }

    .star { border: 1px solid var(--line); background: #fff; border-radius: 8px; width: 38px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; color: var(--faint); transition: transform .1s, border-color .12s; flex: 0 0 auto; }
    .star:active { transform: scale(.9); }
    .star--on { color: var(--accent); border-color: var(--accent); }

    .cat-hint { font-size: 12px; color: var(--soft); margin: 5px 0 10px; }

    .pips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    .pip {
      border: 1px solid var(--line); background: #fff; border-radius: 10px; height: 46px; cursor: pointer;
      font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 15px; color: var(--faint);
      display: flex; align-items: center; justify-content: center;
      transition: transform .1s, background .12s, color .12s, border-color .12s;
    }
    .pip:active { transform: scale(.94); }
    .pip--fill { background: var(--accent); border-color: var(--accent); color: #fff; }
    .pip--sel { box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--accent); font-weight: 700; }

    .scale-key { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--faint); margin-top: 6px; font-family: 'JetBrains Mono', monospace; }

    .notes-row { padding: 14px 16px; }
    .notes-row label { font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 7px; }
    textarea { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 11px; font-family: 'Inter', sans-serif; font-size: 14px; resize: vertical; min-height: 74px; background: #fff; color: var(--ink); outline: 0; }
    textarea:focus { border-color: var(--accent); }
  `],
})
export class CarCardComponent {
  protected readonly svc = inject(ScorecardService);
  protected readonly cats = CATS;
  protected readonly pips = PIP_RANGE;

  readonly car = input.required<Car>();

  specEntries(car: Car): { key: string; value: string }[] {
    return Object.entries(car.specs).map(([key, value]) => ({ key, value }));
  }

  onPrice(event: Event, carId: string): void {
    this.svc.setPrice(carId, (event.target as HTMLInputElement).value);
  }

  onNotes(event: Event, carId: string): void {
    this.svc.setNotes(carId, (event.target as HTMLTextAreaElement).value);
  }
}
