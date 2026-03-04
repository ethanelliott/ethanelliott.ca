import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const DARK_CLASS = 'dark-mode';

@Injectable({ providedIn: 'root' })
export class DarkModeService {
  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.classList.add(DARK_CLASS);
    }
  }
}
