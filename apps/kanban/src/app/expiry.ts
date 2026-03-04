import { inject } from '@ee/di';
import { TasksService } from './tasks/tasks.service';

const CRON_INTERVAL_MINUTES = 5;

export function startExpiryCron(): NodeJS.Timeout {
  const ttlMinutes = parseInt(process.env['TASK_TTL_MINUTES'] ?? '30', 10);

  console.log(
    `[expiry] Starting stale task expiry cron (interval: ${CRON_INTERVAL_MINUTES}m, TTL: ${ttlMinutes}m)`
  );

  const interval = setInterval(async () => {
    try {
      const tasksService = inject(TasksService);
      const expired = await tasksService.expireStaleInProgressTasks(ttlMinutes);
      if (expired > 0) {
        console.log(
          `[expiry] Swept ${expired} stale IN_PROGRESS task(s) → TODO`
        );
      }
    } catch (err) {
      console.error('[expiry] Error during stale task sweep:', err);
    }
  }, CRON_INTERVAL_MINUTES * 60 * 1000);

  // Allow process to exit even with the interval running
  interval.unref();

  return interval;
}
