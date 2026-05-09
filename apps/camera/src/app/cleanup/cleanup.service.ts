import { inject } from '@ee/di';
import { existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import {
  DetectionEvent,
  DetectionSettingsEntity,
} from '../detection/detection.entity';
import { SceneAnalysis } from '../analysis/analysis.entity';

/**
 * CleanupService provides centralised, scheduled age-off for all
 * camera data on the persistent volume:
 *
 * 1. Detection events & snapshots (respects retention + pinned flag)
 * 2. Scene-analysis records linked to expired detections
 * 3. Orphaned snapshot files not tracked in the DB
 * 4. Disk-space-aware emergency cleanup when usage exceeds a threshold
 * 5. SQLite VACUUM after large deletions to reclaim space
 *
 * Runs on startup and then at a configurable interval (default: 30 min).
 */
export class CleanupService {
  private readonly _db = inject(Database);
  private readonly _detectionRepo = this._db.repositoryFor(DetectionEvent);
  private readonly _settingsRepo = this._db.repositoryFor(
    DetectionSettingsEntity
  );
  private readonly _analysisRepo = this._db.repositoryFor(SceneAnalysis);

  private _timer: ReturnType<typeof setInterval> | null = null;
  private _running = false;

  /** How often to run cleanup (default: 30 minutes) */
  private readonly _intervalMs =
    parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '30', 10) * 60 * 1000;

  /** Maximum snapshot count — if exceeded, oldest are removed regardless of age */
  private readonly _maxSnapshots = parseInt(
    process.env.MAX_SNAPSHOTS || '5000',
    10
  );

  /** Disk usage percentage threshold for emergency cleanup (0-100) */
  private readonly _diskThresholdPct = parseInt(
    process.env.DISK_THRESHOLD_PCT || '85',
    10
  );

  private get _dataDir(): string {
    return (
      process.env.DATA_DIR ||
      (process.env.NODE_ENV === 'production' ? '/app/data' : './data')
    );
  }

  private get _snapshotDir(): string {
    return join(this._dataDir, 'snapshots');
  }

  // ── Lifecycle ──

  /**
   * Start the periodic cleanup loop.
   */
  start(): void {
    if (this._timer) return;

    // Initial run after a short delay so other services finish starting
    setTimeout(() => this._run(), 10_000);

    this._timer = setInterval(() => this._run(), this._intervalMs);

    console.log(
      `🧹 Cleanup service started (every ${this._intervalMs / 60_000} min, ` +
        `max ${this._maxSnapshots} snapshots, disk threshold ${this._diskThresholdPct}%)`
    );
  }

  /**
   * Stop the cleanup loop.
   */
  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // ── Core ──

  /**
   * Run cleanup immediately. Can be called from the API.
   * Serialised — concurrent invocations are skipped.
   */
  async runNow(): Promise<void> {
    return this._run();
  }

  /**
   * Single cleanup run. Serialised — concurrent invocations are skipped.
   */
  private async _run(): Promise<void> {
    if (this._running) return;
    this._running = true;

    try {
      const retentionDays = await this._getRetentionDays();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);

      const eventsDeleted = await this._purgeExpiredDetections(cutoff);
      const analysesDeleted = await this._purgeExpiredAnalyses(cutoff);
      const orphansDeleted = this._purgeOrphanedSnapshots(cutoff);
      const cappedDeleted = this._capSnapshotCount();

      const totalDeleted =
        eventsDeleted.rows +
        eventsDeleted.files +
        analysesDeleted +
        orphansDeleted +
        cappedDeleted;

      // Reclaim SQLite space after large deletions
      if (eventsDeleted.rows + analysesDeleted > 100) {
        try {
          await this._db.dataSource.query('VACUUM');
          console.log('🗜️ SQLite VACUUM completed');
        } catch (err) {
          console.error('VACUUM failed:', err);
        }
      }

      // Check disk usage and do emergency cleanup if needed
      const diskPct = this._getDiskUsagePct();
      if (diskPct !== null && diskPct > this._diskThresholdPct) {
        const emergencyDeleted = await this._emergencyCleanup(diskPct);
        if (emergencyDeleted > 0) {
          console.warn(
            `🚨 Emergency cleanup removed ${emergencyDeleted} items (disk was at ${diskPct.toFixed(
              1
            )}%)`
          );
        }
      }

      // Log summary (skip if nothing happened)
      if (
        totalDeleted > 0 ||
        (diskPct !== null && diskPct > this._diskThresholdPct * 0.8)
      ) {
        const diskStr =
          diskPct !== null ? `, disk: ${diskPct.toFixed(1)}%` : '';
        console.log(
          `🧹 Cleanup: ${eventsDeleted.rows} events, ${eventsDeleted.files} event snapshots, ` +
            `${analysesDeleted} analyses, ${orphansDeleted} orphans, ` +
            `${cappedDeleted} over cap${diskStr}`
        );
      }
    } catch (err) {
      console.error('Cleanup error:', err);
    } finally {
      this._running = false;
    }
  }

  // ── Retention-based purge ──

  /**
   * Delete detection events and their snapshot files older than the cutoff.
   * Pinned events are exempt.
   */
  private async _purgeExpiredDetections(
    cutoff: Date
  ): Promise<{ rows: number; files: number }> {
    // Find filenames to delete before we remove the DB rows
    const expiredWithSnapshots = await this._detectionRepo
      .createQueryBuilder('event')
      .select('event.snapshotFilename')
      .where('event.timestamp < :cutoff', { cutoff })
      .andWhere('event.snapshotFilename IS NOT NULL')
      .andWhere('event.pinned = :pinned', { pinned: false })
      .getRawMany();

    let filesDeleted = 0;
    for (const row of expiredWithSnapshots) {
      const filename = row.event_snapshotFilename;
      if (!filename) continue;
      const filePath = join(this._snapshotDir, filename);
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
          filesDeleted++;
        }
      } catch {
        // ignore individual failures
      }
    }

    // Bulk delete expired rows
    const result = await this._detectionRepo
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoff', { cutoff })
      .andWhere('pinned = :pinned', { pinned: false })
      .execute();

    return { rows: result.affected || 0, files: filesDeleted };
  }

  /**
   * Delete scene analysis records older than the cutoff.
   */
  private async _purgeExpiredAnalyses(cutoff: Date): Promise<number> {
    const result = await this._analysisRepo
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoff', { cutoff })
      .execute();

    return result.affected || 0;
  }

  /**
   * Delete snapshot files on disk that aren't tracked in the DB
   * and are older than the cutoff (based on filename timestamp).
   */
  private _purgeOrphanedSnapshots(cutoff: Date): number {
    if (!existsSync(this._snapshotDir)) return 0;

    let deleted = 0;
    try {
      const files = readdirSync(this._snapshotDir).filter(
        (f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
      );

      for (const filename of files) {
        // Parse date from filename: label_YYYY-MM-DDTHH-MM-SS-sssZ_confidence.jpg
        const dateMatch = filename.match(
          /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/
        );
        if (dateMatch) {
          const fileDate = new Date(
            dateMatch[1].replace(/-/g, (m, offset: number) =>
              offset > 9 ? (offset === 13 || offset === 16 ? ':' : '.') : '-'
            )
          );
          if (!isNaN(fileDate.getTime()) && fileDate < cutoff) {
            try {
              unlinkSync(join(this._snapshotDir, filename));
              deleted++;
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // snapshot dir may not exist yet
    }

    return deleted;
  }

  // ── Snapshot cap ──

  /**
   * If the total snapshot count exceeds _maxSnapshots, delete the oldest
   * files to bring it back under the limit.
   */
  private _capSnapshotCount(): number {
    if (!existsSync(this._snapshotDir)) return 0;

    let files: string[];
    try {
      files = readdirSync(this._snapshotDir)
        .filter(
          (f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
        )
        .sort()
        .reverse(); // newest first (filenames contain timestamps)
    } catch {
      return 0;
    }

    if (files.length <= this._maxSnapshots) return 0;

    const toDelete = files.slice(this._maxSnapshots);
    let deleted = 0;
    for (const filename of toDelete) {
      try {
        unlinkSync(join(this._snapshotDir, filename));
        deleted++;
      } catch {
        // ignore
      }
    }

    return deleted;
  }

  // ── Disk-space monitoring ──

  /**
   * Get the percentage of disk used for the data directory's filesystem.
   * Uses `statfs` from `fs` (Node 18.15+). Returns null if unavailable.
   */
  private _getDiskUsagePct(): number | null {
    try {
      const { statfsSync } = require('fs');
      const stats = statfsSync(this._dataDir);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      if (totalBytes === 0) return null;
      return ((totalBytes - freeBytes) / totalBytes) * 100;
    } catch {
      return null;
    }
  }

  /**
   * Emergency cleanup when disk is above threshold.
   * Progressively reduces retention and snapshot count to free space.
   */
  private async _emergencyCleanup(currentPct: number): Promise<number> {
    let totalDeleted = 0;

    // Phase 1: Halve the retention period temporarily
    const retentionDays = await this._getRetentionDays();
    const emergencyRetention = Math.max(1, Math.floor(retentionDays / 2));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - emergencyRetention);

    console.warn(
      `🚨 Disk at ${currentPct.toFixed(
        1
      )}% — emergency cleanup with ${emergencyRetention}d retention`
    );

    const eventsResult = await this._purgeExpiredDetections(cutoff);
    totalDeleted += eventsResult.rows + eventsResult.files;

    const analysesResult = await this._purgeExpiredAnalyses(cutoff);
    totalDeleted += analysesResult;

    totalDeleted += this._purgeOrphanedSnapshots(cutoff);

    // Phase 2: Hard-cap snapshots at half the normal limit
    const emergencyCap = Math.floor(this._maxSnapshots / 2);
    totalDeleted += this._capSnapshotsTo(emergencyCap);

    // Phase 3: VACUUM to reclaim SQLite space
    if (totalDeleted > 0) {
      try {
        await this._db.dataSource.query('VACUUM');
      } catch {
        // ignore
      }
    }

    return totalDeleted;
  }

  /**
   * Cap snapshots to a specific count.
   */
  private _capSnapshotsTo(maxCount: number): number {
    if (!existsSync(this._snapshotDir)) return 0;

    let files: string[];
    try {
      files = readdirSync(this._snapshotDir)
        .filter(
          (f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
        )
        .sort()
        .reverse();
    } catch {
      return 0;
    }

    if (files.length <= maxCount) return 0;

    const toDelete = files.slice(maxCount);
    let deleted = 0;
    for (const filename of toDelete) {
      try {
        unlinkSync(join(this._snapshotDir, filename));
        deleted++;
      } catch {
        // ignore
      }
    }

    return deleted;
  }

  // ── Helpers ──

  /**
   * Read the retention days setting from the DB (fallback to env / 7).
   */
  private async _getRetentionDays(): Promise<number> {
    try {
      const row = await this._settingsRepo.findOne({ where: {} });
      return (
        row?.retentionDays ?? parseInt(process.env.RETENTION_DAYS || '7', 10)
      );
    } catch {
      return parseInt(process.env.RETENTION_DAYS || '7', 10);
    }
  }

  /**
   * Get a summary of current disk usage for logging / API.
   */
  async getStatus(): Promise<CleanupStatus> {
    let snapshotCount = 0;
    let snapshotSizeBytes = 0;

    try {
      const files = readdirSync(this._snapshotDir).filter(
        (f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
      );
      snapshotCount = files.length;
      for (const f of files) {
        try {
          snapshotSizeBytes += statSync(join(this._snapshotDir, f)).size;
        } catch {
          // ignore
        }
      }
    } catch {
      // dir may not exist
    }

    const detectionCount = await this._detectionRepo.count();
    const analysisCount = await this._analysisRepo.count();
    const diskUsagePct = this._getDiskUsagePct();
    const retentionDays = await this._getRetentionDays();

    // SQLite DB size
    let dbSizeMB = 0;
    try {
      const dbPath = join(this._dataDir, 'camera.db');
      if (existsSync(dbPath)) {
        dbSizeMB = Math.round(statSync(dbPath).size / 1024 / 1024);
      }
    } catch {
      // ignore
    }

    return {
      retentionDays,
      maxSnapshots: this._maxSnapshots,
      diskThresholdPct: this._diskThresholdPct,
      diskUsagePct,
      snapshotCount,
      snapshotSizeMB: Math.round(snapshotSizeBytes / 1024 / 1024),
      dbSizeMB,
      detectionEventCount: detectionCount,
      analysisCount,
    };
  }
}

export interface CleanupStatus {
  retentionDays: number;
  maxSnapshots: number;
  diskThresholdPct: number;
  diskUsagePct: number | null;
  snapshotCount: number;
  snapshotSizeMB: number;
  dbSizeMB: number;
  detectionEventCount: number;
  analysisCount: number;
}
