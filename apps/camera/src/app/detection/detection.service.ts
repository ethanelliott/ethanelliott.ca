import { randomUUID } from 'node:crypto';
import { ChildProcess, spawn } from 'child_process';
import { inject } from '@ee/di';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import { DetectionEvent, FrameDetection } from './detection.entity';
import { CameraService } from '../camera/camera.service';
import { WebSocketService } from '../websocket/websocket.service';

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
 * A tracked object correlated across frames via spatial overlap.
 */
interface TrackedObject {
  id: string;
  label: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  firstSeen: Date;
  lastSeen: Date;
  eventId: string;
  frameWidth: number;
  frameHeight: number;
  snapshotFilename: string | null;
}

/**
 * DetectionService runs periodic frame extraction and object detection
 * using TensorFlow.js with COCO-SSD model.
 */
export class DetectionService {
  private readonly _db = inject(Database);
  private readonly _cameraService = inject(CameraService);
  private readonly _wsService = inject(WebSocketService);
  private readonly _repository = this._db.repositoryFor(DetectionEvent);

  private _model: any = null;
  private _tf: any = null;
  private _isRunning = false;
  private _detectionTimer: ReturnType<typeof setInterval> | null = null;

  /** Labels currently enabled for detection reporting */
  private _enabledLabels: Set<string> = new Set(COCO_SSD_LABELS);

  /** Retention period. Events older than this are purged. */
  private _retentionDays = parseInt(process.env.RETENTION_DAYS || '7', 10);

  private _purgeTimer: ReturnType<typeof setInterval> | null = null;

  /** How often to run the purge (1 hour) */
  private readonly _purgeIntervalMs = 60 * 60 * 1000;

  private readonly _threshold = parseFloat(
    process.env.DETECTION_THRESHOLD || '0.6'
  );
  private readonly _interval =
    parseInt(process.env.DETECTION_INTERVAL || '1', 10) * 1000; // Convert to ms

  /** In-memory tracked objects correlated across frames */
  private _trackedObjects = new Map<string, TrackedObject>();

  /** Minimum IoU (Intersection over Union) to consider two boxes the same object */
  private readonly _iouThreshold = parseFloat(
    process.env.IOU_THRESHOLD || '0.3'
  );

  /** How long (ms) before a tracked object is considered stale and removed */
  private readonly _staleTimeoutMs =
    parseInt(process.env.TRACK_STALE_SECONDS || '5', 10) * 1000;

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

    this._isRunning = true;

    // Start periodic detection
    this._detectionTimer = setInterval(async () => {
      try {
        await this._detectFrame();
      } catch (err) {
        console.error('Detection error:', err);
      }
    }, this._interval);

    // Start retention purge timer
    this._purgeTimer = setInterval(async () => {
      try {
        await this._purgeExpiredEvents();
      } catch (err) {
        console.error('Purge error:', err);
      }
    }, this._purgeIntervalMs);

    // Run an initial purge on startup
    this._purgeExpiredEvents().catch((err) =>
      console.error('Initial purge error:', err)
    );

    console.log(
      `🧠 Detection running every ${this._interval / 1000}s (threshold: ${
        this._threshold
      }, retention: ${this._retentionDays}d)`
    );
  }

  /**
   * Stop the detection pipeline
   */
  stop(): void {
    this._isRunning = false;
    if (this._detectionTimer) {
      clearInterval(this._detectionTimer);
      this._detectionTimer = null;
    }
    if (this._purgeTimer) {
      clearInterval(this._purgeTimer);
      this._purgeTimer = null;
    }
  }

  /**
   * Get detection events with optional filtering
   */
  async getEvents(options: {
    limit?: number;
    offset?: number;
    label?: string;
    minConfidence?: number;
    since?: Date;
  }): Promise<{ events: DetectionEvent[]; total: number }> {
    const qb = this._repository.createQueryBuilder('event');

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
  }

  /**
   * Update the retention period
   */
  setRetentionDays(days: number): void {
    this._retentionDays = Math.max(1, Math.min(days, 365));
    console.log(`🗓️ Retention updated to ${this._retentionDays} days`);
  }

  /**
   * Load TF.js and COCO-SSD model
   */
  private async _loadModel(): Promise<void> {
    console.log('🧠 Loading TensorFlow.js and COCO-SSD model...');

    // Dynamic import to handle potential missing packages
    this._tf = await import('@tensorflow/tfjs');

    // Set the TFHUB cache dir for model caching
    const modelCacheDir = join(this._dataDir, 'models');
    if (!existsSync(modelCacheDir)) {
      mkdirSync(modelCacheDir, { recursive: true });
    }

    const cocoSsd = await import('@tensorflow-models/coco-ssd');
    this._model = await cocoSsd.load({
      base: 'lite_mobilenet_v2', // Lighter model for faster inference
    });

    console.log('✅ COCO-SSD model loaded successfully');
  }

  /**
   * Extract a frame from the RTSP stream, run detection, and correlate
   * detections across frames using spatial overlap (IoU).
   */
  private async _detectFrame(): Promise<void> {
    if (!this._model || !this._tf) {
      return;
    }

    let frameBuffer: Buffer;
    try {
      frameBuffer = await this._captureFrame();
    } catch (err) {
      // Don't spam logs for transient frame capture failures
      return;
    }

    try {
      // Decode JPEG to raw pixels using sharp
      const sharp = (await import('sharp')).default;
      const { data, info } = await sharp(frameBuffer)
        .resize(640, 480, { fit: 'inside' }) // Resize for faster detection
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Create tensor from raw pixel data
      const tensor = this._tf.tensor3d(new Uint8Array(data), [
        info.height,
        info.width,
        info.channels,
      ]);

      // Run detection
      const predictions = await this._model.detect(tensor);

      // Clean up tensor
      tensor.dispose();

      // Filter predictions by threshold and enabled labels
      const filtered = predictions.filter(
        (p: any) =>
          p.score >= this._threshold && this._enabledLabels.has(p.class)
      );

      const now = new Date();
      const matchedTrackIds = new Set<string>();
      const frameDetections: FrameDetection[] = [];

      for (const prediction of filtered) {
        const [x, y, width, height] = prediction.bbox;
        const bbox = { x, y, width, height };

        // Try to match against existing tracked objects of the same label
        let bestMatch: TrackedObject | null = null;
        let bestIoU = 0;

        for (const tracked of this._trackedObjects.values()) {
          if (tracked.label !== prediction.class) continue;
          if (matchedTrackIds.has(tracked.id)) continue; // already matched
          const iou = this._computeIoU(bbox, tracked.bbox);
          if (iou >= this._iouThreshold && iou > bestIoU) {
            bestMatch = tracked;
            bestIoU = iou;
          }
        }

        if (bestMatch) {
          // Continuing tracked object — update in-place, no new DB event
          bestMatch.bbox = bbox;
          bestMatch.confidence = prediction.score;
          bestMatch.lastSeen = now;
          bestMatch.frameWidth = info.width;
          bestMatch.frameHeight = info.height;
          matchedTrackIds.add(bestMatch.id);

          frameDetections.push({
            id: bestMatch.eventId,
            label: bestMatch.label,
            confidence: bestMatch.confidence,
            bbox: bestMatch.bbox,
            frameWidth: info.width,
            frameHeight: info.height,
          });
        } else {
          // New object — save to DB, start tracking, emit event for feed
          const saved = await this._createDetectionEvent(
            prediction,
            frameBuffer,
            info.width,
            info.height
          );

          const trackId = randomUUID();
          this._trackedObjects.set(trackId, {
            id: trackId,
            label: prediction.class,
            bbox,
            confidence: prediction.score,
            firstSeen: now,
            lastSeen: now,
            eventId: saved.id,
            frameWidth: info.width,
            frameHeight: info.height,
            snapshotFilename: saved.snapshotFilename,
          });

          // Emit individual 'detection' event for the event feed (new objects only)
          this._wsService.emitDetection({
            id: saved.id,
            timestamp: saved.timestamp,
            label: saved.label,
            confidence: saved.confidence,
            snapshotFilename: saved.snapshotFilename || null,
            bbox: saved.bbox,
            frameWidth: saved.frameWidth,
            frameHeight: saved.frameHeight,
            pinned: saved.pinned,
          });

          frameDetections.push({
            id: saved.id,
            label: saved.label,
            confidence: saved.confidence,
            bbox: saved.bbox,
            frameWidth: info.width,
            frameHeight: info.height,
          });

          console.log(
            `🎯 New: ${prediction.class} (${Math.round(
              prediction.score * 100
            )}%)${saved.snapshotFilename ? ` → ${saved.snapshotFilename}` : ''}`
          );
        }
      }

      // Emit all current-frame detections for the live overlay
      this._wsService.emitFrameDetections(frameDetections);

      // Age out tracked objects not seen recently
      this._ageOutTrackedObjects(now);
    } catch (err) {
      console.error('Frame processing error:', err);
    }
  }

  /**
   * Capture a single frame from the RTSP stream using FFmpeg
   */
  private async _captureFrame(): Promise<Buffer> {
    const rtspUrl = await this._cameraService.getRtspUrl();

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];

      const proc = spawn(
        'ffmpeg',
        [
          '-rtsp_transport',
          'tcp',
          '-i',
          rtspUrl,
          '-frames:v',
          '1',
          '-f',
          'image2',
          '-c:v',
          'mjpeg',
          '-q:v',
          '5',
          'pipe:1',
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Frame capture timed out'));
      }, 15000);

      proc.stdout?.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`Frame capture failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Create a new detection event: save snapshot and store in DB.
   * Does NOT emit via WebSocket — the caller handles that.
   */
  private async _createDetectionEvent(
    prediction: { bbox: number[]; class: string; score: number },
    frameBuffer: Buffer,
    frameWidth: number,
    frameHeight: number
  ): Promise<DetectionEvent> {
    const [x, y, width, height] = prediction.bbox;

    // Save snapshot for high-confidence detections
    let snapshotFilename: string | null = null;
    if (prediction.score >= this._threshold) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      snapshotFilename = `${prediction.class}_${timestamp}_${Math.round(
        prediction.score * 100
      )}.jpg`;
      const snapshotPath = join(this._snapshotDir, snapshotFilename);

      try {
        writeFileSync(snapshotPath, frameBuffer);
      } catch (err) {
        console.error('Failed to save snapshot:', err);
        snapshotFilename = null;
      }
    }

    // Store detection event in database
    const event = this._repository.create({
      label: prediction.class,
      confidence: prediction.score,
      snapshotFilename,
      bbox: { x, y, width, height },
      frameWidth,
      frameHeight,
    });

    return this._repository.save(event);
  }

  /**
   * Compute Intersection over Union for two bounding boxes.
   */
  private _computeIoU(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const union = areaA + areaB - intersection;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Remove tracked objects that haven't been seen within the stale timeout.
   */
  private _ageOutTrackedObjects(now: Date): void {
    for (const [id, tracked] of this._trackedObjects) {
      if (now.getTime() - tracked.lastSeen.getTime() > this._staleTimeoutMs) {
        this._trackedObjects.delete(id);
      }
    }
  }

  /**
   * Purge detection events and snapshots older than the retention period.
   * Runs on startup and then every hour.
   */
  private async _purgeExpiredEvents(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this._retentionDays);

    // Find expired events that have snapshots so we can delete the files
    const expiredWithSnapshots = await this._repository
      .createQueryBuilder('event')
      .select('event.snapshotFilename')
      .where('event.timestamp < :cutoff', { cutoff })
      .andWhere('event.snapshotFilename IS NOT NULL')
      .andWhere('event.pinned = :pinned', { pinned: false })
      .getRawMany();

    // Delete snapshot files
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
        // Ignore individual file delete failures
      }
    }

    // Also clean up orphaned snapshot files not in the DB
    // (e.g. from crashes before the DB row was written)
    try {
      const allFiles = readdirSync(this._snapshotDir).filter(
        (f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
      );
      for (const filename of allFiles) {
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
              filesDeleted++;
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // Snapshot dir may not exist yet
    }

    // Bulk delete expired rows from the database (skip pinned)
    const result = await this._repository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoff', { cutoff })
      .andWhere('pinned = :pinned', { pinned: false })
      .execute();

    const rowsDeleted = result.affected || 0;

    if (rowsDeleted > 0 || filesDeleted > 0) {
      console.log(
        `🧹 Retention purge: deleted ${rowsDeleted} events and ${filesDeleted} snapshots older than ${this._retentionDays}d`
      );

      // Reclaim SQLite space after large deletions
      if (rowsDeleted > 100) {
        try {
          await this._db.dataSource.query('VACUUM');
          console.log('🗜️ SQLite VACUUM completed');
        } catch (err) {
          console.error('VACUUM failed:', err);
        }
      }
    }
  }
}
