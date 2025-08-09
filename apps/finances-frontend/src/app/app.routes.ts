import { Route } from '@angular/router';
import { UserLogin } from './login/login';
import { HomePage } from './home/home';
import { UserRegister } from './register/register';

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
    path: '**',
    redirectTo: '/',
  },
];
