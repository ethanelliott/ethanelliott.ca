import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_KEY = 'kanban-dark-mode';
const DARK_CLASS = 'dark-mode';

@Injectable({ providedIn: 'root' })
export class DarkModeService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly isDark = signal(this._readPreference());

  constructor() {
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      document.documentElement.classList.toggle(DARK_CLASS, this.isDark());
      localStorage.setItem(STORAGE_KEY, String(this.isDark()));
    });
  }

  toggle(): void {
    this.isDark.update((v) => !v);
  }

  private _readPreference(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === 'true';
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    } catch {
      return true;
    }
  }
}
