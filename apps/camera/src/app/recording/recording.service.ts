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
import { readFile } from 'fs/promises';
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
 * A contiguous run of footage inside a DVR window.
 *
 * Recording gaps (camera offline, FFmpeg restart) collapse to nothing in the
 * assembled playlist, so media time and wall-clock time drift apart across a
 * gap. Emitting the runs lets the client map between the two exactly:
 * within a run, `mediaTime = wallClock - start + mediaOffsetSec`.
 */
export interface DvrRun {
  start: string;
  end: string;
  mediaOffsetSec: number;
}

export interface DvrWindow {
  /** Start of the assembled window (first segment actually included) */
  start: string;
  /** End of the assembled window (the DVR edge, ~1 segment behind live) */
  end: string;
  /** Total playable duration, excluding gaps */
  durationSec: number;
  segmentCount: number;
  /** Oldest footage on disk, regardless of the window that was requested */
  availableStart: string | null;
  /** Contiguous runs of footage, in order */
  runs: DvrRun[];
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

    const completed = this._completedSegments();

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

  // ── DVR playback ──
  //
  // The rolling recording segments double as an HLS media playlist: they are
  // already MPEG-TS written with `-c copy`, so a DVR window can be assembled
  // by listing them — no re-encode, no extra FFmpeg output, no extra disk.

  /**
   * Describe the DVR window ending at the current DVR edge and covering at
   * most `minutes` of wall-clock time.
   *
   * Returns null when no completed segments overlap the window.
   */
  getDvrWindow(minutes: number): DvrWindow | null {
    const all = this._listSegments();
    const completed = this._completedSegments(all);
    if (completed.length === 0) return null;

    const edgeEpoch =
      completed[completed.length - 1].epoch + this.getSegmentSeconds();
    const fromEpoch = edgeEpoch - Math.round(minutes * 60);
    const timed = this._timedSegments(completed, fromEpoch);
    if (timed.length === 0) return null;

    // Walk the segments, starting a new run wherever the footage is not
    // contiguous (a segment that does not begin where the previous ended).
    const runs: DvrRun[] = [];
    let mediaOffsetSec = 0;
    let runStart = timed[0].epoch;
    let runEnd = timed[0].epoch;
    let runOffset = 0;

    for (const { epoch, duration } of timed) {
      if (epoch > runEnd + 1) {
        runs.push({
          start: new Date(runStart * 1000).toISOString(),
          end: new Date(runEnd * 1000).toISOString(),
          mediaOffsetSec: runOffset,
        });
        runStart = epoch;
        runOffset = mediaOffsetSec;
      }
      runEnd = epoch + duration;
      mediaOffsetSec += duration;
    }
    runs.push({
      start: new Date(runStart * 1000).toISOString(),
      end: new Date(runEnd * 1000).toISOString(),
      mediaOffsetSec: runOffset,
    });

    return {
      start: new Date(timed[0].epoch * 1000).toISOString(),
      end: new Date(runEnd * 1000).toISOString(),
      durationSec: Math.round(mediaOffsetSec * 1000) / 1000,
      segmentCount: timed.length,
      availableStart: all.length
        ? new Date(all[0].epoch * 1000).toISOString()
        : null,
      runs,
    };
  }

  /**
   * Build an HLS playlist for a DVR window.
   *
   * The playlist is a VOD snapshot rather than a live playlist: the client
   * requests a fresh one when it changes the window, and switches back to the
   * low-latency live playlist to catch up to the edge. That keeps seeking
   * predictable — media time never shifts underneath the scrubber.
   *
   * Every segment gets an `EXT-X-DISCONTINUITY`: the recording output runs
   * with `-reset_timestamps 1`, so each segment restarts its PTS at zero and
   * the player must be told not to expect a continuous timeline.
   */
  buildDvrPlaylist(minutes: number): string | null {
    const completed = this._completedSegments();
    if (completed.length === 0) return null;

    const edgeEpoch =
      completed[completed.length - 1].epoch + this.getSegmentSeconds();
    const timed = this._timedSegments(
      completed,
      edgeEpoch - Math.round(minutes * 60)
    );
    if (timed.length === 0) return null;

    const targetDuration = Math.ceil(
      timed.reduce((max, s) => Math.max(max, s.duration), 0)
    );

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-DISCONTINUITY-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
    ];

    for (const { filename, epoch, duration } of timed) {
      lines.push('#EXT-X-DISCONTINUITY');
      lines.push(
        `#EXT-X-PROGRAM-DATE-TIME:${new Date(epoch * 1000).toISOString()}`
      );
      lines.push(`#EXTINF:${duration.toFixed(3)},`);
      lines.push(`dvr/${filename}`);
    }

    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n') + '\n';
  }

  /**
   * Read a recording segment for DVR playback.
   * Only `rec_<epoch>.ts` names are accepted, so the filename can never
   * escape the recordings directory.
   */
  async readDvrSegment(filename: string): Promise<Buffer | null> {
    if (!/^rec_\d+\.ts$/.test(filename)) return null;
    try {
      return await readFile(join(this._recordingsDir, filename));
    } catch {
      return null;
    }
  }

  /**
   * Segments FFmpeg has finished writing. The newest segment on disk is still
   * being appended to, so serving it would truncate mid-frame.
   */
  private _completedSegments(segments?: SegmentInfo[]): SegmentInfo[] {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const segmentSeconds = this.getSegmentSeconds();
    return (segments ?? this._listSegments()).filter(
      (s) => s.epoch + segmentSeconds + 3 <= nowEpoch
    );
  }

  /**
   * Attach a measured duration to each segment at or after `fromEpoch`.
   *
   * Copy-mode segments drift from the requested `segment_time` (cuts land on
   * keyframes), so the gap to the next segment on disk is the only accurate
   * duration available — but only while recording was continuous. A gap much
   * larger than the nominal length means recording stopped, not that the
   * segment is long, so those fall back to the nominal duration rather than
   * padding the playlist with time that was never recorded.
   */
  private _timedSegments(
    completed: SegmentInfo[],
    fromEpoch: number
  ): (SegmentInfo & { duration: number })[] {
    const segmentSeconds = this.getSegmentSeconds();
    const maxDrift = segmentSeconds * 1.5;

    const timed: (SegmentInfo & { duration: number })[] = [];
    for (let i = 0; i < completed.length; i++) {
      const segment = completed[i];
      if (segment.epoch + segmentSeconds <= fromEpoch) continue;

      const next = completed[i + 1];
      const gap = next ? next.epoch - segment.epoch : segmentSeconds;
      timed.push({
        ...segment,
        duration: gap > maxDrift ? segmentSeconds : Math.max(gap, 0.1),
      });
    }
    return timed;
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
