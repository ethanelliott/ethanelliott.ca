import { Injectable, signal } from '@angular/core';

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'theme-pref';

/**
 * Applies a light/dark/system theme by toggling `.dark-mode` on <html>
 * (which also drives PrimeNG's dark mode). The choice is persisted; an inline
 * script in index.html applies it pre-boot to avoid a flash.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly pref = signal<ThemePref>(this.read());

  private readonly mql =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  constructor() {
    this.apply();
    this.mql?.addEventListener('change', () => {
      if (this.pref() === 'system') this.apply();
    });
  }

  setPref(pref: ThemePref): void {
    this.pref.set(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // storage may be unavailable (private mode) — fall back to in-memory
    }
    this.apply();
  }

  private read(): ThemePref {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch {
      // ignore
    }
    return 'system';
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    const dark =
      this.pref() === 'dark' ||
      (this.pref() === 'system' && !!this.mql?.matches);
    document.documentElement.classList.toggle('dark-mode', dark);
  }
}
