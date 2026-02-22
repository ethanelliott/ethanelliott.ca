import { ChildProcess, spawn } from 'child_process';
import { inject } from '@ee/di';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import { DetectionEvent } from './detection.entity';
import { CameraService } from '../camera/camera.service';
import { WebSocketService } from '../websocket/websocket.service';

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

  private readonly _threshold = parseFloat(
    process.env.DETECTION_THRESHOLD || '0.6'
  );
  private readonly _interval =
    parseInt(process.env.DETECTION_INTERVAL || '3', 10) * 1000; // Convert to ms

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

    console.log(
      `🧠 Detection running every ${this._interval / 1000}s (threshold: ${
        this._threshold
      })`
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
   * Extract a frame from the RTSP stream and run detection
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

      // Process predictions
      for (const prediction of predictions) {
        if (prediction.score >= this._threshold) {
          await this._handleDetection(
            prediction,
            frameBuffer,
            info.width,
            info.height
          );
        }
      }
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
   * Handle a confirmed detection: save snapshot, store event, emit via WebSocket
   */
  private async _handleDetection(
    prediction: { bbox: number[]; class: string; score: number },
    frameBuffer: Buffer,
    frameWidth: number,
    frameHeight: number
  ): Promise<void> {
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

    const saved = await this._repository.save(event);

    // Emit real-time event via WebSocket
    this._wsService.emitDetection({
      id: saved.id,
      timestamp: saved.timestamp,
      label: saved.label,
      confidence: saved.confidence,
      snapshotFilename: saved.snapshotFilename || null,
      bbox: saved.bbox,
      frameWidth: saved.frameWidth,
      frameHeight: saved.frameHeight,
    });

    console.log(
      `🎯 Detected: ${prediction.class} (${Math.round(
        prediction.score * 100
      )}%)${snapshotFilename ? ` → ${snapshotFilename}` : ''}`
    );
  }
}
