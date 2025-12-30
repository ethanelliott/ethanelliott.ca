import { Route } from '@angular/router';
import { UserLogin } from './login/login';
import { UserRegister } from './register/register';
import { Dashboard } from './dashboard/dashboard';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: 'login',
    component: UserLogin,
  },
  {
    path: 'register',
    component: UserRegister,
  },
  {
    path: 'dashboard',
    component: Dashboard,
    children: [
      {
        path: '',
        redirectTo: 'all-time',
        pathMatch: 'full',
      },
      {
        path: 'overview',
        redirectTo: 'all-time',
        pathMatch: 'full',
      },
      {
        path: 'all-time',
        loadComponent: () =>
          import('./dashboard/overview/all-time-overview.component').then(
            (m) => m.AllTimeOverviewComponent
          ),
      },
      {
        path: 'monthly-habits',
        loadComponent: () =>
          import(
            './dashboard/overview/monthly-habits/monthly-habits.component'
          ).then((m) => m.MonthlyHabitsComponent),
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./dashboard/transactions/transactions.component').then(
            (m) => m.TransactionsComponent
          ),
      },
      {
        path: 'transfers',
        loadComponent: () =>
          import('./dashboard/transfers/transfers.component').then(
            (m) => m.TransfersComponent
          ),
      },
      {
        path: 'accounts',
        loadComponent: () =>
          import('./dashboard/accounts/accounts.component').then(
            (m) => m.AccountsComponent
          ),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./dashboard/categories/categories.component').then(
            (m) => m.CategoriesComponent
          ),
      },
      {
        path: 'tags',
        loadComponent: () =>
          import('./dashboard/tags/tags.component').then(
            (m) => m.TagsComponent
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./dashboard/profile/profile.component').then(
            (m) => m.ProfileComponent
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '/',
  },
];
