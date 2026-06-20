import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { ConnectivityService } from './connectivity.service';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks mutating requests unless the backend is reachable. Reads still go out
 * (and are served from the service-worker cache when offline); writes are
 * paused until the backend answers again, surfacing a clear error.
 */
export const offlineGuardInterceptor: HttpInterceptorFn = (req, next) => {
  const connectivity = inject(ConnectivityService);

  if (!READ_METHODS.has(req.method) && !connectivity.isOnline()) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 0,
          statusText: 'Offline',
          url: req.url,
          error: {
            message:
              "You're offline — changes are paused until you reconnect.",
          },
        })
    );
  }

  return next(req);
};
