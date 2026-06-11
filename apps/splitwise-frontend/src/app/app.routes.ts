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
      { path: '', redirectTo: 'groups', pathMatch: 'full' },
      {
        path: 'groups',
        loadComponent: () =>
          import('./pages/groups/groups.component').then(
            (m) => m.GroupsComponent
          ),
      },
      {
        path: 'groups/:id',
        loadComponent: () =>
          import('./pages/group-detail/group-detail.component').then(
            (m) => m.GroupDetailComponent
          ),
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('./pages/activity/activity.component').then(
            (m) => m.ActivityComponent
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
