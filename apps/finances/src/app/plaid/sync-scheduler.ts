import cron, { ScheduledTask } from 'node-cron';
import { inject } from '@ee/di';
import { Database } from '../data-source';
import { PlaidService } from './plaid.service';
import { PlaidItem, PlaidItemStatus } from './plaid-item.entity';
import { SyncType } from './sync-log.entity';
import { User } from '../users/user';

export class SyncScheduler {
  private readonly _plaidService = inject(PlaidService);
  private readonly _plaidItemRepository =
    inject(Database).repositoryFor(PlaidItem);
  private readonly _userRepository = inject(Database).repositoryFor(User);

  private _isRunning = false;
  private _cronJob: ScheduledTask | null = null;

  /**
   * Start the sync scheduler
   * Runs every 2 hours by default
   */
  start(cronExpression: string = '0 */2 * * *'): void {
    if (this._cronJob) {
      console.log('⏰ Sync scheduler already running');
      return;
    }

    console.log(`⏰ Starting sync scheduler with cron: ${cronExpression}`);

    this._cronJob = cron.schedule(cronExpression, async () => {
      await this.runSync();
    });

    console.log('⏰ Sync scheduler started');
  }

  /**
   * Stop the sync scheduler
   */
  stop(): void {
    if (this._cronJob) {
      this._cronJob.stop();
      this._cronJob = null;
      console.log('⏰ Sync scheduler stopped');
    }
  }

  /**
   * Run sync for all active items across all users
   */
  async runSync(): Promise<void> {
    if (this._isRunning) {
      console.log('⏰ Sync already in progress, skipping...');
      return;
    }

    this._isRunning = true;
    console.log('⏰ Starting scheduled sync...');
    const startTime = Date.now();

    try {
      // Get all active Plaid items
      const items = await this._plaidItemRepository.find({
        where: { status: PlaidItemStatus.ACTIVE },
        relations: { user: true },
      });

      console.log(`⏰ Found ${items.length} items to sync`);

      let successCount = 0;
      let errorCount = 0;

      for (const item of items) {
        try {
          const result = await this._plaidService.syncTransactions(
            item.id,
            item.user.id,
            SyncType.SCHEDULED
          );

          console.log(
            `⏰ Synced ${item.institutionName || item.itemId}: +${
              result.added
            } modified ${result.modified}`
          );
          successCount++;
        } catch (error: any) {
          console.error(
            `⏰ Failed to sync ${item.institutionName || item.itemId}:`,
            error.message
          );
          errorCount++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `⏰ Sync completed in ${duration}ms: ${successCount} success, ${errorCount} errors`
      );
    } catch (error: any) {
      console.error('⏰ Sync scheduler error:', error);
    } finally {
      this._isRunning = false;
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this._cronJob !== null;
  }

  /**
   * Check if a sync is currently in progress
   */
  isSyncing(): boolean {
    return this._isRunning;
  }
}

// Singleton instance for use in main.ts
let schedulerInstance: SyncScheduler | null = null;

export function getSyncScheduler(): SyncScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new SyncScheduler();
  }
  return schedulerInstance;
}

export function startSyncScheduler(cronExpression?: string): void {
  getSyncScheduler().start(cronExpression);
}

export function stopSyncScheduler(): void {
  getSyncScheduler().stop();
}
