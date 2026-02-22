import { Route } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent
          ),
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./pages/events/events.component').then(
            (m) => m.EventsComponent
          ),
      },
      {
        path: 'archive',
        loadComponent: () =>
          import('./pages/archive/archive.component').then(
            (m) => m.ArchiveComponent
          ),
      },
    ],
  },
];
