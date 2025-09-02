import {
  HttpInterceptorFn,
  HttpClient,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  catchError,
  switchMap,
  throwError,
  BehaviorSubject,
  filter,
  take,
  Observable,
} from 'rxjs';

// Global state to manage token refresh
let isRefreshing = false;
let refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  console.log('🔍 Auth interceptor called for:', req.url);

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
  console.log('🎫 Access token exists:', !!accessToken);

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
        console.log('🔑 Access token expired, attempting refresh...');

        if (isRefreshing) {
          console.log('🔄 Refresh already in progress, waiting...');
          // If refresh is already in progress, wait for it to complete
          return refreshTokenSubject.pipe(
            filter((token) => token !== null),
            take(1),
            switchMap((token) => {
              if (token) {
                console.log('🔄 Using refreshed token for queued request');
                const retryReq = req.clone({
                  setHeaders: {
                    Authorization: `Bearer ${token}`,
                  },
                });
                return next(retryReq);
              } else {
                // Refresh failed, redirect to login
                console.log(
                  '🔄 Refresh failed for queued request, redirecting to login'
                );
                router.navigate(['/login']);
                return throwError(() => error);
              }
            })
          );
        }

        const refreshToken = localStorage.getItem('refreshToken');
        console.log('🔄 Refresh token found:', !!refreshToken);

        if (refreshToken) {
          isRefreshing = true;
          refreshTokenSubject.next(null);

          console.log(
            '📤 Sending refresh request with token:',
            refreshToken.substring(0, 10) + '...'
          );
          return http
            .post<{ accessToken: string; refreshToken: string }>(
              'http://localhost:8080/users/token/refresh',
              {
                refreshToken,
              }
            )
            .pipe(
              switchMap((response) => {
                console.log('✅ Token refresh successful');
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
                console.error('❌ Token refresh failed:', refreshError);
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
