import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  catchError,
  filter,
  switchMap,
  take,
  throwError,
} from 'rxjs';

// Global state to manage token refresh
let isRefreshing = false;
const refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Inject dependencies at the function level (within injection context)
  const router = inject(Router);
  const http = inject(HttpClient);

  // Skip token injection for login, register, and refresh endpoints
  if (
    req.url.includes('/login') ||
    req.url.includes('/register') ||
    req.url.includes('/refresh')
  ) {
    return next(req);
  }

  const accessToken = localStorage.getItem('accessToken');

  let authReq = req;
  if (accessToken) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        if (isRefreshing) {
          // If refresh is already in progress, wait for it to complete
          return refreshTokenSubject.pipe(
            filter((token) => token !== null),
            take(1),
            switchMap((token) => {
              if (token) {
                const retryReq = req.clone({
                  setHeaders: {
                    Authorization: `Bearer ${token}`,
                  },
                });
                return next(retryReq);
              } else {
                // Refresh failed, redirect to login
                router.navigate(['/login']);
                return throwError(() => error);
              }
            })
          );
        }

        const refreshToken = localStorage.getItem('refreshToken');

        if (refreshToken) {
          isRefreshing = true;
          refreshTokenSubject.next(null);

          return http
            .post<{ accessToken: string; refreshToken: string }>(
              'https://finances-service.elliott.haus/users/token/refresh',
              {
                refreshToken,
              }
            )
            .pipe(
              switchMap((response) => {
                isRefreshing = false;
                localStorage.setItem('accessToken', response.accessToken);
                localStorage.setItem('refreshToken', response.refreshToken);

                // Notify all waiting requests of the new token
                refreshTokenSubject.next(response.accessToken);

                // Retry the original request with new token
                const retryReq = req.clone({
                  setHeaders: {
                    Authorization: `Bearer ${response.accessToken}`,
                  },
                });
                return next(retryReq);
              }),
              catchError((refreshError) => {
                isRefreshing = false;

                // Notify all waiting requests that refresh failed
                refreshTokenSubject.next(null);

                // Clear tokens and redirect to login
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                router.navigate(['/login']);
                return throwError(() => refreshError);
              })
            );
        } else {
          // No refresh token, redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          router.navigate(['/login']);
          return throwError(() => error);
        }
      }
      return throwError(() => error);
    })
  );
};
