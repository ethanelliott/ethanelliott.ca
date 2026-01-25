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
        path: 'inbox',
        loadComponent: () =>
          import('./dashboard/inbox/inbox.component').then(
            (m) => m.InboxComponent
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
      {
        path: 'chat',
        loadComponent: () =>
          import('./dashboard/chat/chat.component').then(
            (m) => m.ChatComponent
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '/',
  },
];
