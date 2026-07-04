import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  map,
  shareReplay,
  switchMap,
  throwError,
} from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * The refresh currently in flight, shared by every request that hit a 401
 * while it runs. It emits the new access token, or errors — so waiters never
 * hang on a failed refresh (the old BehaviorSubject version deadlocked them).
 */
let refreshInFlight: Observable<string> | null = null;

function refreshAccessToken(
  http: HttpClient,
  router: Router
): Observable<string> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    localStorage.removeItem('accessToken');
    void router.navigate(['/login']);
    return throwError(() => new Error('Not signed in'));
  }

  refreshInFlight = http
    .post<{ accessToken: string; refreshToken: string }>(
      `${environment.apiUrl}/users/token/refresh`,
      { refreshToken }
    )
    .pipe(
      map((res) => {
        localStorage.setItem('accessToken', res.accessToken);
        localStorage.setItem('refreshToken', res.refreshToken);
        return res.accessToken;
      }),
      catchError((refreshError) => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        void router.navigate(['/login']);
        return throwError(() => refreshError);
      }),
      finalize(() => {
        refreshInFlight = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

  return refreshInFlight;
}

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

  const withToken = (r: HttpRequest<unknown>, token: string | null) =>
    token
      ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : r;

  return next(withToken(req, localStorage.getItem('accessToken'))).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }
      // Wait on the (possibly already running) refresh, then retry once with
      // the new token. If the retry 401s again, that error propagates —
      // no second refresh loop.
      return refreshAccessToken(http, router).pipe(
        switchMap((token) => next(withToken(req, token)))
      );
    })
  );
};
