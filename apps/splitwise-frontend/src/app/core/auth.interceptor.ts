import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  BehaviorSubject,
  catchError,
  filter,
  switchMap,
  take,
  throwError,
} from 'rxjs';
import { environment } from '../../environments/environment';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const http = inject(HttpClient);

  // Don't attach/refresh tokens for the auth endpoints themselves.
  if (
    req.url.includes('/login') ||
    req.url.includes('/register') ||
    req.url.includes('/token/refresh')
  ) {
    return next(req);
  }

  const accessToken = localStorage.getItem('accessToken');
  const authReq = accessToken
    ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      if (isRefreshing) {
        return refreshTokenSubject.pipe(
          filter((token) => token !== null),
          take(1),
          switchMap((token) =>
            next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
          )
        );
      }

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        localStorage.removeItem('accessToken');
        router.navigate(['/login']);
        return throwError(() => error);
      }

      isRefreshing = true;
      refreshTokenSubject.next(null);

      return http
        .post<{ accessToken: string; refreshToken: string }>(
          `${environment.apiUrl}/users/token/refresh`,
          { refreshToken }
        )
        .pipe(
          switchMap((res) => {
            isRefreshing = false;
            localStorage.setItem('accessToken', res.accessToken);
            localStorage.setItem('refreshToken', res.refreshToken);
            refreshTokenSubject.next(res.accessToken);
            return next(
              req.clone({
                setHeaders: { Authorization: `Bearer ${res.accessToken}` },
              })
            );
          }),
          catchError((refreshError) => {
            isRefreshing = false;
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            router.navigate(['/login']);
            return throwError(() => refreshError);
          })
        );
    })
  );
};
