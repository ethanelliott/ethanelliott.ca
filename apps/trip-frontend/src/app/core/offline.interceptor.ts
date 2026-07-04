import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ConnectivityService } from './connectivity.service';
import { OfflineQueueService } from './offline-queue.service';
import { QUEUE_IF_OFFLINE } from './offline-context';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Gates mutating requests on backend reachability. Reads still go out (and
 * are served from the service-worker cache when offline). Writes marked with
 * QUEUE_IF_OFFLINE are stored for replay on reconnect and answered with an
 * empty 202 (callers treat a null body as "queued"); all other writes fail
 * fast with a clear error.
 */
export const offlineGuardInterceptor: HttpInterceptorFn = (req, next) => {
  const connectivity = inject(ConnectivityService);

  if (!READ_METHODS.has(req.method) && !connectivity.isOnline()) {
    if (req.method === 'PUT' && req.context.get(QUEUE_IF_OFFLINE)) {
      inject(OfflineQueueService).enqueue(req.method, req.url, req.body);
      return of(new HttpResponse({ status: 202, body: null }));
    }
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
