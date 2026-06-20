import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks mutating requests while offline. Reads still go out (and are served
 * from the service-worker cache when there's no connection); writes are paused
 * until the backend is reachable again, surfacing a clear error.
 */
export const offlineGuardInterceptor: HttpInterceptorFn = (req, next) => {
  const isOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isOffline && !READ_METHODS.has(req.method)) {
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
