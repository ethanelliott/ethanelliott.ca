import { Injectable, signal } from '@angular/core';

export type Vibe = 'aero' | 'console' | 'hearth' | 'nebula';

export interface VibeMeta {
  key: Vibe;
  name: string;
  tagline: string;
  swatch: string;
}

export const VIBES: VibeMeta[] = [
  { key: 'aero', name: 'Aero', tagline: 'Minimal & clean', swatch: '#1ba8a0' },
  { key: 'console', name: 'Console', tagline: 'Technical', swatch: '#54f2a0' },
  { key: 'hearth', name: 'Hearth', tagline: 'Cozy', swatch: '#ef7d57' },
  { key: 'nebula', name: 'Nebula', tagline: 'Futuristic', swatch: '#a06bff' },
];

const STORAGE_KEY = 'sensors.vibe';

@Injectable({ providedIn: 'root' })
export class VibeService {
  readonly vibe = signal<Vibe>(this.load());

  set(vibe: Vibe): void {
    this.vibe.set(vibe);
    try {
      localStorage.setItem(STORAGE_KEY, vibe);
    } catch {
      /* ignore */
    }
  }

  private load(): Vibe {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Vibe | null;
      if (saved && VIBES.some((v) => v.key === saved)) return saved;
    } catch {
      /* ignore */
    }
    return 'aero';
  }
}
