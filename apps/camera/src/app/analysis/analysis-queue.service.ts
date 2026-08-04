import { inject } from '@ee/di';
import { LessThanOrEqual, IsNull, Or } from 'typeorm';
import { Database } from '../data-source';
import { AnalysisQueueItem } from './analysis-queue.entity';
import type { EpisodeContext } from '../detection/tracker';

export interface EnqueueRequest {
  detectionEventId: string;
  label: string;
  snapshotFilename: string | null;
  context: EpisodeContext;
}

export interface QueueStats {
  pending: number;
  failed: number;
  oldestPendingAgeSec: number | null;
}

/** Labels worth getting to first when the model is behind. */
const LABEL_PRIORITY: Record<string, number> = {
  person: 100,
  truck: 60,
  car: 55,
  bus: 55,
  motorcycle: 55,
  bicycle: 50,
  dog: 30,
  cat: 30,
};

/**
 * Durable work queue in front of the vision model.
 *
 * One worker, because the model serves one request at a time anyway and
 * concurrency would only add contention. Failures retry with backoff; the
 * queue is bounded so a long model outage cannot grow the table without
 * limit, and when it does have to shed work it drops the least important
 * rather than whatever happened to arrive last.
 */
export class AnalysisQueueService {
  private readonly _db = inject(Database);
  private readonly _repository = this._db.repositoryFor(AnalysisQueueItem);

  /** Backlog past which the lowest-priority pending work is discarded. */
  private readonly _maxPending = parseInt(
    process.env.ANALYSIS_QUEUE_MAX || '200',
    10
  );

  private readonly _maxAttempts = parseInt(
    process.env.ANALYSIS_QUEUE_ATTEMPTS || '4',
    10
  );

  /** How often the worker looks for work when the queue was empty. */
  private readonly _idlePollMs = 1000;

  private _running = false;
  private _worker: ((item: AnalysisQueueItem) => Promise<void>) | null = null;
  private _loopHandle: Promise<void> | null = null;

  /**
   * Start draining the queue. The handler is expected to throw on failure so
   * the item can be retried rather than lost.
   */
  start(worker: (item: AnalysisQueueItem) => Promise<void>): void {
    if (this._running) return;
    this._worker = worker;
    this._running = true;
    this._loopHandle = this._loop();
    console.log('🧵 Analysis queue worker started');
  }

  async stop(): Promise<void> {
    this._running = false;
    await this._loopHandle?.catch(() => undefined);
    this._loopHandle = null;
  }

  /**
   * Add work. Re-queues for the same detection event replace the pending row
   * rather than stacking: a later pass has watched the subject for longer, so
   * it strictly supersedes the one still waiting.
   */
  async enqueue(request: EnqueueRequest): Promise<void> {
    const priority = this._priorityFor(request);

    try {
      const existing = await this._repository.findOne({
        where: { detectionEventId: request.detectionEventId, state: 'pending' },
      });

      if (existing) {
        existing.label = request.label;
        existing.snapshotFilename = request.snapshotFilename;
        existing.context = request.context;
        existing.priority = priority;
        await this._repository.save(existing);
        return;
      }

      await this._shedIfFull();

      await this._repository.save(
        this._repository.create({
          detectionEventId: request.detectionEventId,
          label: request.label,
          snapshotFilename: request.snapshotFilename,
          context: request.context,
          priority,
          state: 'pending',
          attempts: 0,
          nextAttemptAt: null,
        })
      );
    } catch (err) {
      console.error('Failed to enqueue analysis:', err);
    }
  }

  async getStats(): Promise<QueueStats> {
    try {
      const [pending, failed] = await Promise.all([
        this._repository.count({ where: { state: 'pending' } }),
        this._repository.count({ where: { state: 'failed' } }),
      ]);

      const oldest = await this._repository.findOne({
        where: { state: 'pending' },
        order: { createdAt: 'ASC' },
      });

      return {
        pending,
        failed,
        oldestPendingAgeSec: oldest
          ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000)
          : null,
      };
    } catch {
      return { pending: 0, failed: 0, oldestPendingAgeSec: null };
    }
  }

  /** Discard failed rows older than the cutoff. Returns how many went. */
  async pruneFailed(olderThan: Date): Promise<number> {
    try {
      const result = await this._repository
        .createQueryBuilder()
        .delete()
        .where('state = :state AND createdAt < :cutoff', {
          state: 'failed',
          cutoff: olderThan,
        })
        .execute();
      return result.affected ?? 0;
    } catch {
      return 0;
    }
  }

  private async _loop(): Promise<void> {
    while (this._running) {
      let item: AnalysisQueueItem | null = null;
      try {
        item = await this._claim();
      } catch (err) {
        console.error('Analysis queue claim failed:', err);
      }

      if (!item) {
        await sleep(this._idlePollMs);
        continue;
      }

      try {
        await this._worker!(item);
        await this._repository.delete({ id: item.id });
      } catch (err) {
        await this._recordFailure(item, err);
      }
    }
  }

  /** Oldest highest-priority row whose backoff has elapsed. */
  private async _claim(): Promise<AnalysisQueueItem | null> {
    return this._repository.findOne({
      where: {
        state: 'pending',
        nextAttemptAt: Or(IsNull(), LessThanOrEqual(new Date())),
      },
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
  }

  private async _recordFailure(
    item: AnalysisQueueItem,
    err: unknown,
    ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    item.attempts++;
    item.lastError = message.slice(0, 500);

    if (item.attempts >= this._maxAttempts) {
      item.state = 'failed';
      item.nextAttemptAt = null;
      console.error(
        `🧵 Analysis for ${item.label} failed permanently after ${item.attempts} attempts: ${message}`
      );
    } else {
      // 5s, 20s, 80s — long enough to ride out a model restart.
      const delayMs = 5000 * 4 ** (item.attempts - 1);
      item.nextAttemptAt = new Date(Date.now() + delayMs);
      console.warn(
        `🧵 Analysis for ${item.label} failed (attempt ${item.attempts}), retrying in ${
          delayMs / 1000
        }s: ${message}`
      );
    }

    try {
      await this._repository.save(item);
    } catch (saveErr) {
      console.error('Failed to record analysis failure:', saveErr);
    }
  }

  /**
   * Keep the backlog bounded. Sheds the least important waiting work, so a
   * queue that has fallen behind still gets to the people before the cats.
   */
  private async _shedIfFull(): Promise<void> {
    const pending = await this._repository.count({ where: { state: 'pending' } });
    if (pending < this._maxPending) return;

    const victims = await this._repository.find({
      where: { state: 'pending' },
      order: { priority: 'ASC', createdAt: 'ASC' },
      take: pending - this._maxPending + 1,
    });
    if (victims.length === 0) return;

    await this._repository.delete(victims.map((victim) => victim.id));
    console.warn(
      `🧵 Analysis queue at capacity (${pending}) — dropped ${victims.length} low-priority item(s)`
    );
  }

  private _priorityFor(request: EnqueueRequest): number {
    const base = LABEL_PRIORITY[request.label] ?? 40;
    // Later passes over a subject already described matter less than the
    // first look at one nobody has seen yet.
    return base - Math.min(request.context.round - 1, 3) * 10;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
