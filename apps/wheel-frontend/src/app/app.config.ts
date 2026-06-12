import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { MessageService } from 'primeng/api';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

// Wheel teal/green primary palette.
const WheelPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#e4f5f2',
      100: '#bce6df',
      200: '#90d6ca',
      300: '#62c5b4',
      400: '#3bb8a3',
      500: '#11998e',
      600: '#0e8a7f',
      700: '#0a766c',
      800: '#075f57',
      900: '#054942',
      950: '#022824',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    MessageService,
    providePrimeNG({
      theme: {
        preset: WheelPreset,
        options: {
          darkModeSelector: '.dark-mode',
          cssLayer: false,
        },
      },
    }),
  ],
};
