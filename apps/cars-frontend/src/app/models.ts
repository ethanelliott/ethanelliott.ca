export interface Car {
  id: string;
  name: string;
  brand: string;
  color: string;
  tint: string;
  tag: string;
  specs: Record<string, string>;
  feel: string;
  watch: string;
}

export interface Category {
  id: string;
  name: string;
  hint: string;
}

export interface CarState {
  scores: Record<string, number>;
  weights: Record<string, number>;
  price: string;
  notes: string;
}

export interface AppState {
  active: string;
  cars: Record<string, CarState>;
}

export interface ComputedScore {
  pts: number;
  max: number;
  pct: number;
  rated: number;
}
