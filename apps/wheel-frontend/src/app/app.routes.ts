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
    path: 'get-started',
    loadComponent: () =>
      import('./pages/get-started/get-started.component').then(
        (m) => m.GetStartedComponent
      ),
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'wheels', pathMatch: 'full' },
      {
        path: 'wheels',
        loadComponent: () =>
          import('./pages/wheels/wheels.component').then(
            (m) => m.WheelsComponent
          ),
      },
      {
        path: 'wheels/:id',
        loadComponent: () =>
          import('./pages/wheel-detail/wheel-detail.component').then(
            (m) => m.WheelDetailComponent
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
