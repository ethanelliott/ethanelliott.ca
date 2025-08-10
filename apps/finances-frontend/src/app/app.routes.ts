import { Route } from '@angular/router';
import { UserLogin } from './login/login';
import { HomePage } from './home/home';
import { UserRegister } from './register/register';
import { Dashboard } from './dashboard/dashboard';

export const appRoutes: Route[] = [
  {
    path: '',
    component: HomePage,
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
        redirectTo: 'overview',
        pathMatch: 'full',
      },
      {
        path: 'overview',
        loadComponent: () =>
          import('./dashboard/overview/overview.component').then(
            (m) => m.OverviewComponent
          ),
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./dashboard/transactions/transactions.component').then(
            (m) => m.TransactionsComponent
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
        path: 'mediums',
        loadComponent: () =>
          import('./dashboard/mediums/mediums.component').then(
            (m) => m.MediumsComponent
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
