import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { ScorecardService } from './scorecard.service';
import { CARS, CATS } from './data';

@Component({
  selector: 'app-results',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let rows = ranked();
    @let anyRated = rows.some(r => r.rated > 0);
    @let topPts = rows[0]?.pts ?? 0;
    @let maxBar = Math.max(...rows.map(r => r.pct), 1);

    <div class="res-head">
      <h2>Ranking</h2>
    </div>
    <p class="res-note">
      Ranked by total points (your 1–5 ratings, ×2 on anything you starred).
      Rate the same rows on all three for a fair fight — the "rated" count shows who's still incomplete.
    </p>

    @if (!anyRated) {
      <div class="card empty-card">
        <div class="feel" style="border:0;">No scores yet. Drive a car, tap its tab, and rate away — the winner will show up here.</div>
      </div>
    } @else {
      @for (r of rows; track r.car.id; let i = $index) {
        @let isTop = r.pts === topPts && r.pts > 0;
        @let barW = r.pct > 0 ? Math.round(r.pct / maxBar * 100) : 0;
        <div class="rank"
             [class.rank--top]="isTop"
             [style.--accent]="r.car.color"
             [style.--accent-tint]="r.car.tint"
             (click)="gotoCarEvent.emit(r.car.id)"
             role="button" tabindex="0"
             (keydown.enter)="gotoCarEvent.emit(r.car.id)">
          @if (isTop) { <span class="toptag">Top pick</span> }
          <span class="rnum">{{ (i + 1).toString().padStart(2, '0') }}</span>
          <div class="rbody">
            <div class="rname">{{ r.car.name }}</div>
            <div class="rsub">{{ r.car.specs['Fuel'] }} · {{ r.rated }}/{{ catsLen }} rated</div>
            <div class="rbar"><i [style.width.%]="barW"></i></div>
          </div>
          <div class="rright">
            <div class="rscore">{{ r.pts }}</div>
            <div class="rpct">{{ r.pct }}%</div>
            @let carPrice = priceOf(r.car.id);
            @if (carPrice) {
              <div class="rprice">{{ carPrice }}</div>
            }
          </div>
        </div>
      }
    }

    <div class="breakdown">
      <div class="bd-head">
        Category breakdown
        <div class="car-cols">
          @for (car of cars; track car.id) {
            <span class="cc" [style.color]="car.color">{{ car.name.split(' ')[0].slice(0, 4).toUpperCase() }}</span>
          }
        </div>
      </div>
      @for (cat of cats; track cat.id) {
        @let vals = catVals(cat.id);
        @let lead = leadScore(vals);
        @let starred = isStarred(cat.id);
        <div class="bd-row">
          <span class="bn" [class.starred]="starred">{{ starred ? '★ ' : '' }}{{ cat.name }}</span>
          @for (v of vals; track v.id) {
            <span class="bd-cell"
                  [class.bd-cell--lead]="v.s > 0 && v.s === lead"
                  [style.color]="v.s > 0 && v.s === lead ? v.color : 'var(--faint)'">
              {{ v.s > 0 ? v.s : '–' }}
            </span>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .res-head { display: flex; align-items: baseline; justify-content: space-between; margin: 2px 0 12px; }
    .res-head h2 { font-family: 'Saira Condensed', sans-serif; font-weight: 700; text-transform: uppercase; font-size: 22px; margin: 0; letter-spacing: .01em; }
    .res-note { font-size: 12px; color: var(--soft); margin: 0 0 14px; }

    .empty-card { background: #fff; border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); overflow: hidden; }

    .rank {
      display: flex; align-items: center; gap: 13px; padding: 14px; cursor: pointer;
      border: 1px solid var(--line); border-radius: 14px; background: #fff; margin-bottom: 10px;
      box-shadow: var(--shadow); position: relative; overflow: hidden;
    }
    .rank--top { border-color: var(--accent); background: var(--accent-tint); }
    .rnum { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 17px; color: var(--faint); width: 24px; flex: 0 0 auto; }
    .rank--top .rnum { color: var(--accent); }
    .rbody { flex: 1; min-width: 0; }
    .rname { font-family: 'Saira Condensed', sans-serif; font-weight: 600; font-size: 18px; text-transform: uppercase; color: var(--accent); line-height: 1; }
    .rsub { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--faint); margin-top: 3px; letter-spacing: .03em; }
    .rbar { height: 6px; border-radius: 4px; background: var(--line-2); margin-top: 8px; overflow: hidden; }
    .rbar i { display: block; height: 100%; border-radius: 4px; background: var(--accent); transition: width .5s cubic-bezier(.2,.7,.2,1); }
    .rright { text-align: right; flex: 0 0 auto; }
    .rscore { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 22px; line-height: 1; color: var(--ink); }
    .rpct { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--soft); }
    .rprice { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink); margin-top: 5px; }
    .toptag { position: absolute; top: 0; right: 0; background: var(--accent); color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; padding: 3px 8px; border-bottom-left-radius: 9px; }

    .breakdown { margin-top: 18px; background: #fff; border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
    .bd-head { padding: 12px 14px; font-family: 'Saira Condensed', sans-serif; font-weight: 600; text-transform: uppercase; font-size: 14px; letter-spacing: .03em; border-bottom: 1px solid var(--line-2); display: flex; justify-content: space-between; align-items: center; }
    .car-cols { display: flex; gap: 14px; }
    .cc { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: .04em; }
    .bd-row { display: flex; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
    .bd-row:last-child { border-bottom: 0; }
    .bn { flex: 1; color: var(--soft); }
    .bn.starred { color: var(--ink); font-weight: 600; }
    .bd-cell { font-family: 'JetBrains Mono', monospace; font-weight: 500; width: 30px; text-align: center; color: var(--faint); }
    .bd-cell--lead { font-weight: 700; }
  `],
})
export class ResultsComponent {
  protected readonly svc = inject(ScorecardService);
  protected readonly cars = CARS;
  protected readonly cats = CATS;
  protected readonly catsLen = CATS.length;
  protected readonly Math = Math;

  readonly gotoCarEvent = output<string>();

  ranked(): Array<{ car: (typeof CARS)[0]; pts: number; max: number; pct: number; rated: number }> {
    return [...CARS]
      .map(car => ({ car, ...this.svc.compute(car.id) }))
      .sort((a, b) => b.pts - a.pts);
  }

  priceOf(carId: string): string {
    const raw = this.svc.state().cars[carId].price;
    const num = parseInt(raw.replace(/[^\d]/g, ''), 10);
    return num ? '$' + num.toLocaleString() : '';
  }

  catVals(catId: string): { id: string; color: string; s: number }[] {
    return CARS.map(c => ({
      id: c.id,
      color: c.color,
      s: this.svc.state().cars[c.id].scores[catId] ?? 0,
    }));
  }

  leadScore(vals: { s: number }[]): number {
    return Math.max(...vals.map(v => v.s));
  }

  isStarred(catId: string): boolean {
    return CARS.some(c => this.svc.state().cars[c.id].weights[catId] === 2);
  }
}
