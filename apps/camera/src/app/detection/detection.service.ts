import { inject } from '@ee/di';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import {
  DetectionEvent,
  DetectionSettingsEntity,
  FrameDetection,
} from './detection.entity';
import { WebSocketService } from '../websocket/websocket.service';
import { StreamService } from '../stream/stream.service';
import { AnalysisQueueService } from '../analysis/analysis-queue.service';
import { SceneAnalysis } from '../analysis/analysis.entity';
import { MotionDetector } from './motion';
import { Observation, Track, Tracker } from './tracker';
import { ratingFromThreat } from '../analysis/taxonomy';
import type { ThreatLevel } from '../analysis/taxonomy';

/** All 80 COCO-SSD labels */
export const COCO_SSD_LABELS = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
] as const;

/**
 * DetectionService runs the detection cascade over the camera's frames.
 *
 * The cascade escalates in cost. Motion differencing is nearly free and
 * decides whether anything is happening; object detection runs only when it
 * might be; and the vision model — by far the most expensive step — sees a
 * subject once per episode rather than once per frame the tracker happened to
 * lose. Each layer's job is to spend the next layer's budget wisely.
 *
 * There is room for another layer between detection and the vision model — a
 * stronger detector on the GPU — and the seam for it is `_detectObjects`.
 */
export class DetectionService {
  private readonly _db = inject(Database);
  private readonly _streamService = inject(StreamService);
  private readonly _wsService = inject(WebSocketService);
  private readonly _queue = inject(AnalysisQueueService);
  private readonly _repository = this._db.repositoryFor(DetectionEvent);
  private readonly _settingsRepo = this._db.repositoryFor(
    DetectionSettingsEntity
  );

  private _model: any = null;
  private _tf: any = null;
  private _sharp: any = null;
  private _isRunning = false;

  /** Labels currently enabled for detection reporting */
  private _enabledLabels: Set<string> = new Set(COCO_SSD_LABELS);

  /** Retention period. Events older than this are purged. */
  private _retentionDays = parseInt(process.env.RETENTION_DAYS || '7', 10);

  private readonly _threshold = parseFloat(
    process.env.DETECTION_THRESHOLD || '0.6'
  );

  /**
   * Inference rate while something is being tracked. Higher is better for
   * association — halving the gap between frames halves how far a subject can
   * move between them — and the motion gate is what buys the headroom.
   */
  private readonly _activeFps = parseFloat(process.env.DETECTION_FPS || '10');

  /** How often the motion gate is consulted while the scene is still. */
  private readonly _idleFps = parseFloat(process.env.MOTION_CHECK_FPS || '4');

  /**
   * Width the frame is decoded to before inference.
   *
   * COCO-SSD/MobileNet resizes its input to a few hundred pixels square
   * internally, so decoding and tensorising a full 720p frame buys nothing
   * and costs the most expensive part of each pass. Detecting a subject at
   * the far end of the lot is what sets the floor here, not the model.
   */
  private readonly _inputWidth = parseInt(
    process.env.DETECTION_INPUT_WIDTH || '640',
    10
  );

  private readonly _tracker = new Tracker();
  private _motion: MotionDetector | null = null;

  /** Rolling counters, reported by the detection stats endpoint. */
  private _framesInspected = 0;
  private _framesInferred = 0;

  /** Whether the detection loop is currently running */
  private _detectLoopRunning = false;
  /** Abort controller for the detection loop */
  private _detectAbort: AbortController | null = null;

  private get _dataDir(): string {
    return (
      process.env.DATA_DIR ||
      (process.env.NODE_ENV === 'production' ? '/app/data' : './data')
    );
  }

  private get _snapshotDir(): string {
    return join(this._dataDir, 'snapshots');
  }

  /**
   * Start the detection pipeline
   */
  async start(): Promise<void> {
    if (this._isRunning) {
      return;
    }

    // Ensure snapshot directory exists
    if (!existsSync(this._snapshotDir)) {
      mkdirSync(this._snapshotDir, { recursive: true });
    }

    // Restore persisted settings (labels, retention) before anything else
    await this._loadSettings();

    // Load TensorFlow.js and COCO-SSD model
    try {
      await this._loadModel();
    } catch (err) {
      console.error('❌ Failed to load detection model:', err);
      console.warn(
        '⚠️ Detection will be disabled. Install @tensorflow/tfjs and @tensorflow-models/coco-ssd.'
      );
      return;
    }

    // Pre-load sharp so we don't dynamic-import on every frame
    this._sharp = (await import('sharp')).default;
    this._motion = new MotionDetector(this._sharp);

    this._isRunning = true;

    // Start the detection loop — reads frames from the stream service’s
    // combined FFmpeg process (no separate RTSP connection needed)
    this._detectAbort = new AbortController();
    this._runDetectLoop();

    console.log(
      `🧠 Detection cascade running: motion gate at ${this._idleFps} FPS, ` +
        `inference up to ${this._activeFps} FPS ` +
        `(threshold: ${this._threshold}, retention: ${this._retentionDays}d)`
    );
  }

  /**
   * Stop the detection pipeline
   */
  stop(): void {
    this._isRunning = false;
    this._detectAbort?.abort();
    this._detectAbort = null;
  }

  /**
   * Get detection events with optional filtering.
   *
   * With `includeAnalysis`, each event carries its scene analysis inline so a
   * page of events costs one round trip instead of one per row. The link is a
   * plain id column rather than a relation, so the join is spelled out.
   */
  async getEvents(options: {
    limit?: number;
    offset?: number;
    label?: string;
    minConfidence?: number;
    since?: Date;
    until?: Date;
    threat?: ThreatLevel;
    pinnedOnly?: boolean;
    includeAnalysis?: boolean;
  }): Promise<{ events: DetectionEvent[]; total: number }> {
    const qb = this._repository.createQueryBuilder('event');

    // Filtering by threat needs the analysis row regardless of the flag.
    if (options.includeAnalysis || options.threat) {
      qb.leftJoinAndMapOne(
        'event.analysis',
        SceneAnalysis,
        'analysis',
        'analysis.detectionEventId = event.id'
      );
    }

    if (options.label) {
      qb.andWhere('event.label = :label', { label: options.label });
    }

    if (options.minConfidence) {
      qb.andWhere('event.confidence >= :minConf', {
        minConf: options.minConfidence,
      });
    }

    if (options.since) {
      qb.andWhere('event.timestamp >= :since', { since: options.since });
    }

    if (options.until) {
      qb.andWhere('event.timestamp <= :until', { until: options.until });
    }

    // Rows written before the taxonomy have no `threat`, only the legacy
    // rating, so match those through the same mapping the UI displays them
    // with — otherwise filtering would silently hide all older analyses.
    if (options.threat) {
      qb.andWhere(
        '(analysis.threat = :threat OR (analysis.threat IS NULL AND analysis.overallRating = :legacyRating))',
        {
          threat: options.threat,
          legacyRating: ratingFromThreat(options.threat),
        }
      );
    }

    if (options.pinnedOnly) {
      qb.andWhere('event.pinned = :pinned', { pinned: true });
    }

    qb.orderBy('event.timestamp', 'DESC');

    const total = await qb.getCount();

    qb.skip(options.offset || 0);
    qb.take(options.limit || 50);

    const events = await qb.getMany();

    return { events, total };
  }

  /**
   * Get detection statistics
   */
  async getStats(): Promise<{
    totalEvents: number;
    todayEvents: number;
    topLabels: { label: string; count: number }[];
    averageConfidence: number;
    activeTracks: number;
    framesInspected: number;
    framesInferred: number;
    inferenceSkipRate: number;
  }> {
    const totalEvents = await this._repository.count();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEvents = await this._repository
      .createQueryBuilder('event')
      .where('event.timestamp >= :today', { today })
      .getCount();

    const topLabels = await this._repository
      .createQueryBuilder('event')
      .select('event.label', 'label')
      .addSelect('COUNT(*)', 'count')
      .groupBy('event.label')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const avgResult = await this._repository
      .createQueryBuilder('event')
      .select('AVG(event.confidence)', 'avg')
      .getRawOne();

    return {
      totalEvents,
      todayEvents,
      topLabels: topLabels.map((r: any) => ({
        label: r.label,
        count: parseInt(r.count, 10),
      })),
      averageConfidence: parseFloat(avgResult?.avg || '0'),
      activeTracks: this._tracker.size,
      framesInspected: this._framesInspected,
      framesInferred: this._framesInferred,
      // What the motion gate is actually saving. Worth watching while its
      // thresholds are still guesses: near 0 means it is not firing, near 1
      // means it may be gating away real subjects.
      inferenceSkipRate:
        this._framesInspected > 0
          ? Math.round(
              (1 - this._framesInferred / this._framesInspected) * 100
            ) / 100
          : 0,
    };
  }

  /**
   * Get a single detection event by ID
   */
  async getById(id: string): Promise<DetectionEvent | null> {
    return this._repository.findOne({ where: { id } });
  }

  /**
   * Toggle the pinned status of a detection event.
   * Pinned events are exempt from retention purge.
   */
  async togglePin(id: string): Promise<DetectionEvent | null> {
    const event = await this._repository.findOne({ where: { id } });
    if (!event) return null;
    event.pinned = !event.pinned;
    return this._repository.save(event);
  }

  /**
   * Get available labels and which ones are currently enabled
   */
  getSettings(): {
    availableLabels: string[];
    enabledLabels: string[];
    retentionDays: number;
  } {
    return {
      availableLabels: [...COCO_SSD_LABELS],
      enabledLabels: [...this._enabledLabels],
      retentionDays: this._retentionDays,
    };
  }

  /**
   * Update which labels are enabled for detection
   */
  setEnabledLabels(labels: string[]): void {
    this._enabledLabels = new Set(
      labels.filter((l) => (COCO_SSD_LABELS as readonly string[]).includes(l))
    );
    console.log(
      `🏷️ Enabled labels updated: ${this._enabledLabels.size} of ${COCO_SSD_LABELS.length}`
    );
    this._saveSettings();
  }

  /**
   * Update the retention period
   */
  setRetentionDays(days: number): void {
    this._retentionDays = Math.max(1, Math.min(days, 365));
    console.log(`🗓️ Retention updated to ${this._retentionDays} days`);
    this._saveSettings();
  }

  /**
   * Load persisted settings from the database. If no row exists yet,
   * create a default one so future saves can update it.
   */
  private async _loadSettings(): Promise<void> {
    try {
      let row = await this._settingsRepo.findOne({ where: {} });
      if (row) {
        this._enabledLabels = new Set(
          (row.enabledLabels ?? []).filter((l: string) =>
            (COCO_SSD_LABELS as readonly string[]).includes(l)
          )
        );
        this._retentionDays = row.retentionDays ?? 7;
        console.log(
          `⚙️ Loaded persisted settings: ${this._enabledLabels.size} labels, ${this._retentionDays}d retention`
        );
      } else {
        // Seed the settings row with defaults
        row = this._settingsRepo.create({
          enabledLabels: [...COCO_SSD_LABELS],
          retentionDays: this._retentionDays,
        });
        await this._settingsRepo.save(row);
        console.log('⚙️ Initialised default detection settings in DB');
      }
    } catch (err) {
      console.error('Failed to load detection settings:', err);
    }
  }

  /**
   * Persist current in-memory settings to the database.
   */
  private async _saveSettings(): Promise<void> {
    try {
      let row = await this._settingsRepo.findOne({ where: {} });
      if (!row) {
        row = this._settingsRepo.create();
      }
      row.enabledLabels = [...this._enabledLabels];
      row.retentionDays = this._retentionDays;
      await this._settingsRepo.save(row);
    } catch (err) {
      console.error('Failed to persist detection settings:', err);
    }
  }

  /**
   * Load TF.js and COCO-SSD model
   */
  private async _loadModel(): Promise<void> {
    console.log('🧠 Loading TensorFlow.js and COCO-SSD model...');

    // Prefer the native C++ backend (tfjs-node) for ~10-20x faster inference.
    // Falls back to pure-JS tfjs if the native addon is unavailable.
    try {
      this._tf = await import('@tensorflow/tfjs-node');
      console.log('⚡ Using native TensorFlow C++ backend (tfjs-node)');
    } catch {
      this._tf = await import('@tensorflow/tfjs');
      console.log('⚠️ Native tfjs-node unavailable, using pure-JS backend');
    }

    // Set the TFHUB cache dir for model caching
    const modelCacheDir = join(this._dataDir, 'models');
    if (!existsSync(modelCacheDir)) {
      mkdirSync(modelCacheDir, { recursive: true });
    }

    const cocoSsd = await import('@tensorflow-models/coco-ssd');
    this._model = await cocoSsd.load({
      base: 'mobilenet_v2',
    });

    console.log('✅ COCO-SSD model loaded successfully');
  }

  /**
   * The cascade loop.
   *
   * Each pass reads the newest frame and decides how far up the cascade to
   * go. While nothing is tracked, the motion gate usually ends the pass on
   * its own and inference never runs; once a subject exists the gate is
   * bypassed entirely, because a person who stops moving stops generating
   * motion and is exactly the subject worth watching.
   */
  private async _runDetectLoop(): Promise<void> {
    if (this._detectLoopRunning) return;
    this._detectLoopRunning = true;

    const signal = this._detectAbort?.signal;

    while (this._isRunning && !signal?.aborted) {
      const start = Date.now();
      const active = this._tracker.size > 0;

      try {
        await this._tick();
      } catch (err) {
        console.error('Detection error:', err);
      }

      const intervalMs = 1000 / (active ? this._activeFps : this._idleFps);
      const sleepMs = Math.max(0, intervalMs - (Date.now() - start));
      if (sleepMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
    }

    this._detectLoopRunning = false;
  }

  private async _tick(): Promise<void> {
    if (!this._model || !this._tf || !this._sharp) return;

    const frame = this._streamService.getLatestFrame();
    if (!frame) return;

    this._framesInspected++;

    // Layer 0. Skipped while tracking: the gate cannot see a stationary
    // subject, and losing one mid-episode would split it into two events.
    if (this._tracker.size === 0 && this._motion) {
      const motion = await this._motion.check(frame);
      if (!motion.moving) return;
    }

    // Layer 1.
    const detection = await this._detectObjects(frame);
    if (!detection) return;
    this._framesInferred++;

    const { observations, frameWidth, frameHeight } = detection;
    const { confirmed, finished } = this._tracker.update(
      observations,
      frameWidth,
      frameHeight,
      frame
    );

    for (const track of confirmed) {
      await this._openEvent(track);
    }

    // Layer 2 is queued here rather than run here: the model is slow and the
    // loop must not wait on it.
    const now = Date.now();
    for (const track of this._tracker.tracks) {
      if (track.isAnalysisDue(now)) {
        await this._queueAnalysis(track);
      }
    }

    for (const track of finished) {
      await this._closeEvent(track);
    }

    this._emitOverlay();
  }

  /**
   * Layer 1: what objects are in this frame.
   *
   * Isolated so a stronger detector can be dropped in behind the same shape
   * without the cascade around it changing.
   */
  private async _detectObjects(frame: Buffer): Promise<{
    observations: Observation[];
    frameWidth: number;
    frameHeight: number;
  } | null> {
    try {
      const { data, info } = await this._sharp(frame)
        .resize(this._inputWidth, null, { fit: 'inside', withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const tensor = this._tf.tensor3d(new Uint8Array(data), [
        info.height,
        info.width,
        info.channels,
      ]);

      let predictions: any[];
      try {
        predictions = await this._model.detect(tensor);
      } finally {
        tensor.dispose();
      }

      const observations: Observation[] = predictions
        .filter(
          (p: any) =>
            p.score >= this._threshold && this._enabledLabels.has(p.class)
        )
        .map((p: any) => ({
          label: p.class,
          confidence: p.score,
          bbox: {
            x: p.bbox[0],
            y: p.bbox[1],
            width: p.bbox[2],
            height: p.bbox[3],
          },
        }));

      return {
        observations,
        frameWidth: info.width,
        frameHeight: info.height,
      };
    } catch (err) {
      console.error('Frame processing error:', err);
      return null;
    }
  }

  /**
   * Write the DB row for a newly confirmed track.
   *
   * Confirmation needs several frames, which is what keeps a single-frame
   * detector blip from becoming an event in the log. The row is written as
   * soon as the track is real so the live feed updates immediately, well
   * before the model has anything to say about it.
   */
  private async _openEvent(track: Track): Promise<void> {
    try {
      const snapshotFilename = this._writeSnapshot(track);

      const saved = await this._repository.save(
        this._repository.create({
          label: track.label,
          confidence: track.confidence,
          snapshotFilename,
          bbox: track.bbox,
          frameWidth: track.frameWidth,
          frameHeight: track.frameHeight,
        })
      );

      track.eventId = saved.id;
      track.snapshotFilename = snapshotFilename;

      this._wsService.emitDetection({
        id: saved.id,
        timestamp: saved.timestamp,
        label: saved.label,
        confidence: saved.confidence,
        snapshotFilename: saved.snapshotFilename ?? null,
        bbox: saved.bbox,
        frameWidth: saved.frameWidth,
        frameHeight: saved.frameHeight,
        pinned: saved.pinned,
        durationSec: saved.durationSec,
        trajectory: saved.trajectory,
      });

      console.log(
        `🎯 ${track.label} (${Math.round(track.confidence * 100)}%) confirmed after ${track.hits} frames`
      );
    } catch (err) {
      console.error('Failed to open detection event:', err);
    }
  }

  /**
   * Hand the episode so far to the vision model.
   *
   * The snapshot is rewritten from the best frame seen up to this point, so
   * what the model reads — and what the UI shows — is the subject at their
   * most legible rather than at the instant they first crossed the threshold.
   */
  private async _queueAnalysis(track: Track): Promise<void> {
    if (!track.eventId) return;

    const snapshotFilename = this._writeSnapshot(track) ?? track.snapshotFilename;
    track.snapshotFilename = snapshotFilename;

    const context = track.context(this._tracker.confirmedTracks.length);

    await this._queue.enqueue({
      detectionEventId: track.eventId,
      label: track.label,
      snapshotFilename,
      context,
      observedAt: new Date(track.startedAt),
      confidence: track.confidence,
    });

    track.markAnalysisQueued();

    await this._repository
      .update(track.eventId, {
        snapshotFilename,
        durationSec: context.durationSec,
        trajectory: context.trajectory,
      })
      .catch((err) => console.error('Failed to update event episode:', err));
  }

  /**
   * Finalise a track that has left the scene.
   *
   * A subject that came and went inside the first analysis interval has not
   * been described yet, and dropping it would lose exactly the brief visit
   * worth knowing about — so it is queued on the way out.
   */
  private async _closeEvent(track: Track): Promise<void> {
    if (!track.confirmed || !track.eventId) return;

    if (track.analysisRound === 0) {
      await this._queueAnalysis(track);
      return;
    }

    const context = track.context(this._tracker.confirmedTracks.length);
    await this._repository
      .update(track.eventId, {
        durationSec: context.durationSec,
        trajectory: context.trajectory,
      })
      .catch((err) => console.error('Failed to close detection event:', err));
  }

  /** Persist the track's best frame, reusing its filename across passes. */
  private _writeSnapshot(track: Track): string | null {
    if (!track.bestFrame) return null;

    const filename =
      track.snapshotFilename ??
      `${track.label}_${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}_${track.id.slice(0, 8)}.jpg`;

    try {
      writeFileSync(join(this._snapshotDir, filename), track.bestFrame);
      return filename;
    } catch (err) {
      console.error('Failed to save snapshot:', err);
      return track.snapshotFilename;
    }
  }

  /** Push the current boxes to the live overlay. */
  private _emitOverlay(): void {
    const frameDetections: FrameDetection[] = [];
    for (const track of this._tracker.confirmedTracks) {
      frameDetections.push({
        id: track.eventId ?? track.id,
        label: track.label,
        confidence: track.confidence,
        bbox: track.bbox,
        frameWidth: track.frameWidth,
        frameHeight: track.frameHeight,
      });
    }
    this._wsService.emitFrameDetections(frameDetections);
  }
}
