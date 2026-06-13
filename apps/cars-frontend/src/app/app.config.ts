import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

const CarPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f5f5f5',
      100: '#e0e0e0',
      200: '#bdbdbd',
      300: '#9e9e9e',
      400: '#757575',
      500: '#15191c',
      600: '#111518',
      700: '#0d1013',
      800: '#090c0f',
      900: '#05080a',
      950: '#020405',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: CarPreset,
        options: {
          darkModeSelector: '.dark-mode',
          cssLayer: false,
        },
      },
    }),
  ],
};
