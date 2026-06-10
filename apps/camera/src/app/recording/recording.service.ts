import { inject } from '@ee/di';
import { spawn } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import {
  RecordingSettings,
  RecordingSettingsEntity,
  UpdateRecordingSettings,
} from './recording.entity';

/** A completed recording segment on disk. */
interface SegmentInfo {
  filename: string;
  /** Unix epoch (seconds) at which the segment starts */
  epoch: number;
  size: number;
}

export interface RecordingStatus {
  enabled: boolean;
  segmentCount: number;
  totalSizeMB: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  retentionDays: number;
  segmentSeconds: number;
  /** Estimated GB written per day, measured from the segments on disk */
  estimatedDailyGB: number | null;
}

/**
 * RecordingService manages the continuous rolling video recording that
 * StreamService produces (FFmpeg segment output) and extracts playable
 * MP4 clips for time windows around detection events.
 *
 * Segments are MPEG-TS files named `rec_<epochSeconds>.ts` so the time
 * range each one covers can be derived from the filename alone — no DB
 * bookkeeping needed. Clips are built by concatenating the overlapping
 * segments with `-c copy` (no re-encode), so extraction is fast and the
 * clip boundaries snap to segment boundaries (~±1 segment of slack).
 */
export class RecordingService {
  private readonly _db = inject(Database);
  private readonly _settingsRepo = this._db.repositoryFor(
    RecordingSettingsEntity
  );

  /** In-memory cache of the current settings (DB-backed) */
  private _settings: RecordingSettingsEntity | null = null;

  /** Env-var defaults, used to seed the settings row and as fallbacks */
  private readonly _envEnabled = process.env.RECORDING_ENABLED !== 'false';
  private readonly _envSegmentSeconds = parseInt(
    process.env.RECORDING_SEGMENT_SECONDS || '10',
    10
  );
  private readonly _envRetentionDays = parseInt(
    process.env.VIDEO_RETENTION_DAYS || '3',
    10
  );

  /** Extracted clips are cached briefly, then removed */
  private readonly _clipMaxAgeMs = 60 * 60 * 1000;

  /** Dedupe concurrent extraction requests for the same clip */
  private readonly _inFlight = new Map<
    string,
    Promise<{ path: string; filename: string } | null>
  >();

  private get _dataDir(): string {
    return (
      process.env.DATA_DIR ||
      (process.env.NODE_ENV === 'production' ? '/app/data' : './data')
    );
  }

  private get _recordingsDir(): string {
    return process.env.RECORDINGS_DIR || join(this._dataDir, 'recordings');
  }

  private get _clipsDir(): string {
    return join(this._dataDir, 'clips');
  }

  /**
   * Load settings from the database (or create defaults from env vars).
   * Called once during startup, before the stream starts.
   */
  async initialize(): Promise<void> {
    try {
      let row = await this._settingsRepo.findOne({ where: {} });
      if (!row) {
        row = this._settingsRepo.create({
          enabled: this._envEnabled,
          retentionDays: this._envRetentionDays,
          segmentSeconds: this._envSegmentSeconds,
        });
        await this._settingsRepo.save(row);
        console.log('🎞️ Initialized default recording settings');
      }
      this._settings = row;
      console.log(
        `🎞️ Recording ${row.enabled ? 'ENABLED' : 'disabled'} ` +
          `(${row.segmentSeconds}s segments, ${row.retentionDays}d retention)`
      );
    } catch (err) {
      console.error('Failed to load recording settings:', err);
    }
  }

  isEnabled(): boolean {
    return this._settings?.enabled ?? this._envEnabled;
  }

  getSegmentSeconds(): number {
    return this._settings?.segmentSeconds ?? this._envSegmentSeconds;
  }

  getRetentionDays(): number {
    return this._settings?.retentionDays ?? this._envRetentionDays;
  }

  getSettings(): RecordingSettings {
    return {
      enabled: this.isEnabled(),
      retentionDays: this.getRetentionDays(),
      segmentSeconds: this.getSegmentSeconds(),
    };
  }

  /**
   * Update recording settings and persist them.
   * Returns whether the FFmpeg stream must be restarted for the change
   * to take effect (enabling/disabling recording or resizing segments).
   * A lowered retention is applied to disk immediately.
   */
  async updateSettings(
    update: UpdateRecordingSettings
  ): Promise<{ settings: RecordingSettings; requiresStreamRestart: boolean }> {
    if (!this._settings) {
      await this.initialize();
    }
    const row = this._settings;
    if (!row) {
      throw new Error('Recording settings unavailable');
    }

    const requiresStreamRestart =
      (update.enabled !== undefined && update.enabled !== row.enabled) ||
      (update.segmentSeconds !== undefined &&
        update.segmentSeconds !== row.segmentSeconds);

    if (update.enabled !== undefined) row.enabled = update.enabled;
    if (update.retentionDays !== undefined)
      row.retentionDays = update.retentionDays;
    if (update.segmentSeconds !== undefined)
      row.segmentSeconds = update.segmentSeconds;

    await this._settingsRepo.save(row);

    // Apply a shortened retention right away so the storage card
    // reflects the change without waiting for the next cleanup run.
    if (update.retentionDays !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - row.retentionDays);
      const pruned = this.pruneOlderThan(cutoff);
      if (pruned > 0) {
        console.log(
          `🎞️ Retention change pruned ${pruned} recording segments`
        );
      }
    }

    return { settings: this.getSettings(), requiresStreamRestart };
  }

  /**
   * FFmpeg output pattern for the recording segments.
   * `%s` is expanded by FFmpeg (strftime) to the segment start epoch.
   */
  getSegmentPattern(): string {
    return join(this._recordingsDir, 'rec_%s.ts');
  }

  /** Create the recordings/clips directories if missing. */
  ensureDirs(): void {
    for (const dir of [this._recordingsDir, this._clipsDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Extract an MP4 clip covering [start, start + durationSec].
   * Returns null when no recorded segments overlap the window.
   *
   * The clip is built from whole segments, so it may start up to one
   * segment before `start` and end up to one segment after — fine for
   * event playback, and avoids broken keyframe-less cuts.
   */
  async extractClip(
    start: Date,
    durationSec: number
  ): Promise<{ path: string; filename: string } | null> {
    if (!this.isEnabled()) return null;
    this.ensureDirs();
    this._pruneClips();

    const segmentSeconds = this.getSegmentSeconds();
    const startEpoch = Math.floor(start.getTime() / 1000);
    const endEpoch = startEpoch + Math.ceil(durationSec);
    const nowEpoch = Math.floor(Date.now() / 1000);

    // Skip segments that may still be written by FFmpeg
    const completed = this._listSegments().filter(
      (s) => s.epoch + segmentSeconds + 3 <= nowEpoch
    );

    const inWindow = completed.filter(
      (s) => s.epoch >= startEpoch && s.epoch < endEpoch
    );
    // Include the segment that was already running at `start` (covers
    // the head of the window). Copy-mode segments can exceed the target
    // duration slightly, hence the 2x slack.
    const before = completed
      .filter(
        (s) =>
          s.epoch < startEpoch && s.epoch + segmentSeconds * 2 > startEpoch
      )
      .pop();
    const segments = before ? [before, ...inWindow] : inWindow;

    if (segments.length === 0) return null;

    const clipFilename = `clip_${startEpoch}_${Math.ceil(durationSec)}.mp4`;
    const clipPath = join(this._clipsDir, clipFilename);

    // Browsers issue several parallel range requests for the same clip
    // URL — join an in-flight extraction before trusting the filesystem.
    const inFlight = this._inFlight.get(clipFilename);
    if (inFlight) return inFlight;

    // Completed clips are renamed into place atomically, so an existing
    // file is always a fully written MP4.
    if (existsSync(clipPath)) {
      return { path: clipPath, filename: clipFilename };
    }

    const promise = this._concatSegments(segments, clipPath, clipFilename);
    this._inFlight.set(clipFilename, promise);
    try {
      return await promise;
    } finally {
      this._inFlight.delete(clipFilename);
    }
  }

  /**
   * Delete recording segments older than the cutoff (and stale clips).
   * Returns the number of segment files removed.
   */
  pruneOlderThan(cutoff: Date): number {
    const cutoffEpoch = Math.floor(cutoff.getTime() / 1000);
    let deleted = 0;
    for (const segment of this._listSegments()) {
      if (segment.epoch >= cutoffEpoch) continue;
      try {
        unlinkSync(join(this._recordingsDir, segment.filename));
        deleted++;
      } catch {
        // ignore individual failures
      }
    }
    this._pruneClips();
    return deleted;
  }

  /** Current recording storage usage for status/cleanup reporting. */
  getStorageStats(): { segmentCount: number; sizeMB: number } {
    const segments = this._listSegments();
    const bytes = segments.reduce((sum, s) => sum + s.size, 0);
    return {
      segmentCount: segments.length,
      sizeMB: Math.round(bytes / 1024 / 1024),
    };
  }

  getStatus(): RecordingStatus {
    const segmentSeconds = this.getSegmentSeconds();
    const segments = this._listSegments();
    const totalBytes = segments.reduce((sum, s) => sum + s.size, 0);
    const oldest = segments[0];
    const newest = segments[segments.length - 1];

    // Estimate the daily write rate once we have ≥10 minutes of footage
    let estimatedDailyGB: number | null = null;
    if (oldest && newest) {
      const spanSec = newest.epoch + segmentSeconds - oldest.epoch;
      if (spanSec >= 600) {
        estimatedDailyGB =
          Math.round(((totalBytes / spanSec) * 86_400) / 1e7) / 100;
      }
    }

    return {
      enabled: this.isEnabled(),
      segmentCount: segments.length,
      totalSizeMB: Math.round(totalBytes / 1024 / 1024),
      oldestTimestamp: oldest
        ? new Date(oldest.epoch * 1000).toISOString()
        : null,
      newestTimestamp: newest
        ? new Date((newest.epoch + segmentSeconds) * 1000).toISOString()
        : null,
      retentionDays: this.getRetentionDays(),
      segmentSeconds,
      estimatedDailyGB,
    };
  }

  /** List segments on disk, sorted oldest → newest. */
  private _listSegments(): SegmentInfo[] {
    if (!existsSync(this._recordingsDir)) return [];

    const segments: SegmentInfo[] = [];
    try {
      for (const filename of readdirSync(this._recordingsDir)) {
        const match = filename.match(/^rec_(\d+)\.ts$/);
        if (!match) continue;
        try {
          const { size } = statSync(join(this._recordingsDir, filename));
          segments.push({ filename, epoch: parseInt(match[1], 10), size });
        } catch {
          // file may have been pruned mid-listing
        }
      }
    } catch {
      return [];
    }

    return segments.sort((a, b) => a.epoch - b.epoch);
  }

  /**
   * Concatenate segments into a single MP4 with stream copy.
   * Uses the concat demuxer; `-reset_timestamps 1` on the segment output
   * means each segment starts at t=0, so concat re-offsets them cleanly.
   */
  private _concatSegments(
    segments: SegmentInfo[],
    clipPath: string,
    clipFilename: string
  ): Promise<{ path: string; filename: string } | null> {
    // Write to a temp file and rename into place on success so that
    // concurrent requests never see a partially written MP4.
    const partPath = `${clipPath}.part`;
    const listPath = `${clipPath}.txt`;
    const listContent = segments
      .map((s) => `file '${join(this._recordingsDir, s.filename)}'`)
      .join('\n');

    return new Promise((resolve) => {
      try {
        writeFileSync(listPath, listContent);
      } catch (err) {
        console.error('❌ Failed to write concat list:', err);
        resolve(null);
        return;
      }

      const args = [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-f',
        'mp4',
        partPath,
      ];

      const proc = spawn('ffmpeg', args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
      }, 30_000);

      const cleanup = () => {
        clearTimeout(timeout);
        try {
          unlinkSync(listPath);
        } catch {
          // ignore
        }
      };

      proc.on('close', (code) => {
        cleanup();
        if (code === 0 && existsSync(partPath)) {
          try {
            renameSync(partPath, clipPath);
            resolve({ path: clipPath, filename: clipFilename });
            return;
          } catch (err) {
            console.error('❌ Failed to finalize clip:', err);
          }
        }
        console.error(
          `❌ Clip extraction failed (code ${code}): ${stderr.slice(-500)}`
        );
        try {
          unlinkSync(partPath);
        } catch {
          // ignore
        }
        resolve(null);
      });

      proc.on('error', (err) => {
        cleanup();
        console.error('❌ FFmpeg clip spawn error:', err);
        resolve(null);
      });
    });
  }

  /** Remove cached clips older than the max age. */
  private _pruneClips(): void {
    if (!existsSync(this._clipsDir)) return;
    const cutoff = Date.now() - this._clipMaxAgeMs;
    try {
      for (const filename of readdirSync(this._clipsDir)) {
        if (
          !filename.endsWith('.mp4') &&
          !filename.endsWith('.txt') &&
          !filename.endsWith('.part')
        ) {
          continue;
        }
        const filePath = join(this._clipsDir, filename);
        try {
          if (statSync(filePath).mtimeMs < cutoff) {
            unlinkSync(filePath);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
}
