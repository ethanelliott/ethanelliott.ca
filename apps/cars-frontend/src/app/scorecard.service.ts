import { Injectable, signal } from '@angular/core';
import { CARS, CATS } from './data';
import type { AppState, CarState, ComputedScore } from './models';

const STORAGE_KEY = 'scorecard:v1';

function blankCar(): CarState {
  const scores: Record<string, number> = {};
  const weights: Record<string, number> = {};
  CATS.forEach(c => { scores[c.id] = 0; weights[c.id] = 1; });
  return { scores, weights, price: '', notes: '' };
}

function defaultState(): AppState {
  const cars: Record<string, CarState> = {};
  CARS.forEach(c => { cars[c.id] = blankCar(); });
  return { active: CARS[0].id, cars };
}

@Injectable({ providedIn: 'root' })
export class ScorecardService {
  readonly state = signal<AppState>(defaultState());

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<AppState>;
      if (!saved?.cars) return;

      const s = defaultState();
      CARS.forEach(c => {
        const sc = (saved.cars?.[c.id] ?? {}) as Partial<CarState>;
        CATS.forEach(cat => {
          if (typeof sc.scores?.[cat.id] === 'number') s.cars[c.id].scores[cat.id] = sc.scores[cat.id] as number;
          if (typeof sc.weights?.[cat.id] === 'number') s.cars[c.id].weights[cat.id] = sc.weights[cat.id] as number;
        });
        s.cars[c.id].price = sc.price ?? '';
        s.cars[c.id].notes = sc.notes ?? '';
      });
      if (saved.active) s.active = saved.active;
      this.state.set(s);
    } catch {
      // no stored data yet
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      // storage unavailable
    }
  }

  setActive(id: string): void {
    this.state.update(s => ({ ...s, active: id }));
    this.save();
  }

  setScore(carId: string, catId: string, val: number): void {
    this.state.update(s => {
      const cur = s.cars[carId].scores[catId];
      return {
        ...s,
        cars: {
          ...s.cars,
          [carId]: {
            ...s.cars[carId],
            scores: { ...s.cars[carId].scores, [catId]: cur === val ? 0 : val },
          },
        },
      };
    });
    this.save();
  }

  toggleWeight(carId: string, catId: string): void {
    this.state.update(s => ({
      ...s,
      cars: {
        ...s.cars,
        [carId]: {
          ...s.cars[carId],
          weights: {
            ...s.cars[carId].weights,
            [catId]: s.cars[carId].weights[catId] === 2 ? 1 : 2,
          },
        },
      },
    }));
    this.save();
  }

  setPrice(carId: string, price: string): void {
    this.state.update(s => ({
      ...s,
      cars: { ...s.cars, [carId]: { ...s.cars[carId], price } },
    }));
    this.save();
  }

  setNotes(carId: string, notes: string): void {
    this.state.update(s => ({
      ...s,
      cars: { ...s.cars, [carId]: { ...s.cars[carId], notes } },
    }));
    this.save();
  }

  reset(): void {
    this.state.set(defaultState());
    this.save();
  }

  compute(carId: string): ComputedScore {
    const c = this.state().cars[carId];
    let pts = 0, max = 0, rated = 0;
    CATS.forEach(cat => {
      const s = c.scores[cat.id] ?? 0;
      const w = c.weights[cat.id] ?? 1;
      if (s > 0) { pts += s * w; max += 5 * w; rated++; }
    });
    const pct = max > 0 ? Math.round(pts / max * 100) : 0;
    return { pts, max, pct, rated };
  }
}
