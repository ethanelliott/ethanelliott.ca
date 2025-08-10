import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Don't add token to auth endpoints
  if (
    req.url.includes('/register') ||
    req.url.includes('/login') ||
    req.url.includes('/token/refresh')
  ) {
    return next(req);
  }

  const token = localStorage.getItem('accessToken');

  if (token) {
    const authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    });

    return next(authReq).pipe(
      catchError((error) => {
        // If we get a 401, try to refresh the token
        if (error.status === 401) {
          const refreshToken = localStorage.getItem('refreshToken');
          if (refreshToken) {
            const http = inject(HttpClient);
            return http
              .post<any>('http://localhost:8080/users/token/refresh', {
                refreshToken,
              })
              .pipe(
                switchMap((response) => {
                  // Update stored tokens
                  localStorage.setItem('accessToken', response.accessToken);
                  localStorage.setItem('refreshToken', response.refreshToken);

                  // Retry the original request with new token
                  const retryReq = req.clone({
                    headers: req.headers.set(
                      'Authorization',
                      `Bearer ${response.accessToken}`
                    ),
                  });
                  return next(retryReq);
                }),
                catchError((refreshError) => {
                  // Refresh failed, redirect to login
                  localStorage.removeItem('accessToken');
                  localStorage.removeItem('refreshToken');
                  const router = inject(Router);
                  router.navigate(['/login']);
                  return throwError(() => refreshError);
                })
              );
          } else {
            // No refresh token, redirect to login
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            const router = inject(Router);
            router.navigate(['/login']);
            return throwError(() => error);
          }
        }

        return throwError(() => error);
      })
    );
  }

  return next(req);
};
