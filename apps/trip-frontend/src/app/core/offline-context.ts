import { HttpContextToken } from '@angular/common/http';

/**
 * Marks a mutation as safe to queue while offline (idempotent PUTs like
 * packing/paid toggles). The offline interceptor stores such requests and the
 * OfflineQueueService replays them on reconnect; everything else still fails
 * fast with a clear "you're offline" error.
 */
export const QUEUE_IF_OFFLINE = new HttpContextToken<boolean>(() => false);
