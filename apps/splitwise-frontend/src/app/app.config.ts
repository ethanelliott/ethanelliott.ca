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

// Splitwise-style green primary palette
const SplitwisePreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#e7f6f1',
      100: '#c3e9dc',
      200: '#9bdbc5',
      300: '#6fccac',
      400: '#48c098',
      500: '#1b9e77',
      600: '#178a68',
      700: '#137457',
      800: '#0f5d46',
      900: '#0b4634',
      950: '#06241b',
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
        preset: SplitwisePreset,
        options: {
          darkModeSelector: '.dark-mode',
          cssLayer: false,
        },
      },
    }),
  ],
};
