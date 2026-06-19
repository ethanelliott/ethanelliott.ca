import { Route } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { MainLayoutComponent } from './layout/main-layout.component';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/register/register.component').then(
        (m) => m.RegisterComponent
      ),
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'trips', pathMatch: 'full' },
      {
        path: 'trips',
        loadComponent: () =>
          import('./pages/trips/trips.component').then((m) => m.TripsComponent),
      },
      {
        path: 'trips/:id',
        loadComponent: () =>
          import('./pages/trip-detail/trip-detail.component').then(
            (m) => m.TripDetailComponent
          ),
      },
      {
        path: 'trips/:id/schedule',
        loadComponent: () =>
          import('./pages/schedule/schedule.component').then(
            (m) => m.ScheduleComponent
          ),
      },
      {
        path: 'trips/:id/map',
        loadComponent: () =>
          import('./pages/map/map.component').then((m) => m.MapComponent),
      },
      {
        path: 'trips/:id/budget',
        loadComponent: () =>
          import('./pages/budget/budget.component').then(
            (m) => m.BudgetComponent
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/profile.component').then(
            (m) => m.ProfileComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
