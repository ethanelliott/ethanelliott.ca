import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./home/home.component').then((p) => p.HomeComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
