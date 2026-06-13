import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { ScorecardService } from './scorecard.service';
import { CarCardComponent } from './car-card.component';
import { ResultsComponent } from './results.component';
import { CARS, CATS } from './data';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CarCardComponent, ResultsComponent, ConfirmDialog],
  providers: [ConfirmationService],
  template: `
    <p-confirmdialog />

    <div class="wrap">
      <header>
        <p class="eyebrow">Test Drive · 3-Way Compare</p>
        <h1>Scorecard</h1>
        <p class="lede">Drive one, then rate it 1–5 on each row. Tap ☆ on anything that matters extra to you. The Ranking tab tallies it up and crowns a winner.</p>
      </header>

      <div class="tabs">
        @for (car of cars; track car.id) {
          @let cd = svc.compute(car.id);
          @let active = svc.state().active === car.id;
          <button class="tab"
                  [class.tab--active]="active"
                  [style.background]="active ? car.color : ''"
                  (click)="svc.setActive(car.id)">
            <span class="dot" [style.background]="active ? '#fff' : car.color"></span>
            <span class="tname">{{ car.name.split(' ')[0] }}</span>
            <span class="tmeta">{{ cd.rated > 0 ? cd.pts + ' pts' : '—' }}</span>
          </button>
        }
        @let resultsActive = svc.state().active === 'results';
        <button class="tab"
                [class.tab--active]="resultsActive"
                [style.background]="resultsActive ? 'var(--ink)' : ''"
                (click)="svc.setActive('results')">
          <span class="tname">Ranking</span>
          <span class="tmeta">1·2·3</span>
        </button>
      </div>

      @if (svc.state().active === 'results') {
        <app-results (gotoCarEvent)="svc.setActive($event)" />
      } @else {
        @let currentCar = getActiveCar();
        @if (currentCar) {
          <app-car-card [car]="currentCar" />
        }
      }

      @if (svc.state().active === 'results') {
        <button class="reset" (click)="confirmReset()">Reset all scores</button>
      }

      <p class="foot">
        Fuel, power &amp; warranty figures are Canadian / NRCan ratings, pre-filled for reference.
        Everything you tap is saved on this device automatically.
      </p>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .wrap { max-width: 540px; margin: 0 auto; padding: 0 14px; padding-bottom: 48px; }

    header { padding: 22px 0 12px; }
    .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--faint); margin: 0 0 6px; }
    h1 { font-family: 'Saira Condensed', sans-serif; font-weight: 700; font-size: 34px; line-height: .98; letter-spacing: .005em; text-transform: uppercase; margin: 0; }
    .lede { font-size: 13.5px; color: var(--soft); margin: 8px 0 0; max-width: 42ch; }

    .tabs {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
      margin: 18px 0 14px; position: sticky; top: 0; z-index: 20;
      background: linear-gradient(var(--paper) 72%, rgba(235,238,234,0));
      padding: 8px 0 10px;
    }
    .tab {
      border: 1px solid var(--line); background: #fff; border-radius: 11px;
      padding: 9px 4px 8px; cursor: pointer; text-align: center;
      transition: transform .12s ease, border-color .12s, background .12s;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      min-height: 52px; justify-content: center;
    }
    .tab:active { transform: scale(.97); }
    .tab .tname { font-family: 'Saira Condensed', sans-serif; font-weight: 600; font-size: 14.5px; line-height: 1; text-transform: uppercase; letter-spacing: .02em; color: var(--ink); }
    .tab .tmeta { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--faint); letter-spacing: .04em; }
    .tab--active { color: #fff; border-color: transparent; box-shadow: var(--shadow); }
    .tab--active .tname, .tab--active .tmeta { color: #fff; }
    .tab--active .tmeta { opacity: .85; }
    .dot { width: 7px; height: 7px; border-radius: 50%; }

    .reset { margin: 18px 0 6px; width: 100%; border: 1px solid var(--line); background: #fff; color: var(--soft); border-radius: 11px; padding: 12px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; }
    .reset:active { transform: scale(.99); }

    .foot { text-align: center; font-size: 11px; color: var(--faint); margin: 16px 0 4px; padding: 0 16px; line-height: 1.5; }
  `],
})
export class AppComponent implements OnInit {
  protected readonly svc = inject(ScorecardService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly cars = CARS;
  protected readonly cats = CATS;

  ngOnInit(): void {
    this.svc.load();
  }

  getActiveCar() {
    return CARS.find(c => c.id === this.svc.state().active) ?? null;
  }

  confirmReset(): void {
    this.confirm.confirm({
      message: "Clear all scores, prices, and notes for all three cars? This can't be undone.",
      header: 'Reset scorecard',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Reset everything',
      rejectLabel: 'Cancel',
      accept: () => this.svc.reset(),
    });
  }
}
