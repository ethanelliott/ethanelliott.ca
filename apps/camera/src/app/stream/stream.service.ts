import { ChildProcess, spawn } from 'child_process';
import { inject } from '@ee/di';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { CameraService } from '../camera/camera.service';

/**
 * StreamService manages the FFmpeg process that converts
 * RTSP to HLS for browser-based live streaming.
 */
export class StreamService {
  private readonly _cameraService = inject(CameraService);
  private _ffmpegProcess: ChildProcess | null = null;
  private _isRunning = false;
  private _restartAttempts = 0;
  private _maxRestartAttempts = 10;
  private _restartDelay = 5000; // ms
  private _watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private _lastSegmentTime = 0;

  /** How long (ms) without a new segment before we consider the stream stalled */
  private readonly _watchdogTimeoutMs = 30_000;

  private readonly _hlsDir = process.env.HLS_DIR || join(this._dataDir, 'hls');

  private get _dataDir(): string {
    return (
      process.env.DATA_DIR ||
      (process.env.NODE_ENV === 'production' ? '/app/data' : './data')
    );
  }

  /**
   * Start the FFmpeg RTSP→HLS pipeline
   */
  async start(): Promise<void> {
    if (this._isRunning) {
      console.warn('⚠️ Stream service is already running');
      return;
    }

    // Ensure HLS directory exists
    if (!existsSync(this._hlsDir)) {
      mkdirSync(this._hlsDir, { recursive: true });
    }

    // Purge stale HLS files from previous runs so the player doesn't
    // loop over old segments after a restart.
    this._cleanHlsDir();

    const rtspUrl = await this._cameraService.getRtspUrl();
    this._restartAttempts = 0;
    this._startFfmpeg(rtspUrl);
  }

  /**
   * Stop the FFmpeg process
   */
  stop(): void {
    this._isRunning = false;
    this._stopWatchdog();
    if (this._ffmpegProcess) {
      this._ffmpegProcess.kill('SIGTERM');
      this._ffmpegProcess = null;
    }
  }

  /**
   * Get the HLS directory path
   */
  getHlsDir(): string {
    return this._hlsDir;
  }

  /**
   * Check if the stream is currently running
   */
  isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Read a file from the HLS directory
   */
  readHlsFile(filename: string): Buffer | null {
    const filePath = join(this._hlsDir, filename);

    // Prevent directory traversal
    if (!filePath.startsWith(this._hlsDir)) {
      return null;
    }

    try {
      return readFileSync(filePath);
    } catch {
      return null;
    }
  }

  /**
   * List HLS files in the directory
   */
  listHlsFiles(): string[] {
    try {
      return readdirSync(this._hlsDir).filter(
        (f) => f.endsWith('.m3u8') || f.endsWith('.ts')
      );
    } catch {
      return [];
    }
  }

  /**
   * Start the FFmpeg process
   */
  private _startFfmpeg(rtspUrl: string): void {
    const outputPath = join(this._hlsDir, 'stream.m3u8');

    const args = [
      // Input options – keep RTSP connection alive
      '-rtsp_transport',
      'tcp',
      '-rtsp_flags',
      'prefer_tcp',
      // RTSP/network timeout to detect stalled cameras
      '-timeout',
      '10000000', // 10 seconds in microseconds
      '-i',
      rtspUrl,

      // Video codec: transcode for HLS compatibility
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency',
      '-g',
      '30', // keyframe interval
      '-sc_threshold',
      '0',

      // Audio codec
      '-c:a',
      'aac',
      '-b:a',
      '128k',

      // HLS output settings
      '-f',
      'hls',
      '-hls_time',
      '2', // 2-second segments
      '-hls_list_size',
      '10', // Keep 10 segments in playlist
      '-hls_flags',
      'delete_segments+independent_segments',
      '-hls_segment_filename',
      join(this._hlsDir, 'segment_%03d.ts'),

      // Overwrite output
      '-y',
      outputPath,
    ];

    console.log('🎬 Starting FFmpeg with args:', args.join(' '));

    this._ffmpegProcess = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this._isRunning = true;

    this._ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        // Track segment output: FFmpeg logs "Opening 'segment_xxx.ts' for writing"
        if (msg.includes('.ts') && msg.includes('Opening')) {
          this._lastSegmentTime = Date.now();
          // Reset restart counter on healthy output
          this._restartAttempts = 0;
        }
        // Log all FFmpeg messages prefixed for easy grep
        console.log(`FFmpeg: ${msg}`);
      }
    });

    this._ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      this._ffmpegProcess = null;

      if (this._isRunning && this._restartAttempts < this._maxRestartAttempts) {
        this._restartAttempts++;
        console.log(
          `🔄 Restarting FFmpeg (attempt ${this._restartAttempts}/${this._maxRestartAttempts}) in ${this._restartDelay}ms...`
        );
        setTimeout(async () => {
          try {
            const url = await this._cameraService.getRtspUrl();
            this._startFfmpeg(url);
          } catch (err) {
            console.error('❌ Failed to restart FFmpeg:', err);
          }
        }, this._restartDelay);
      }
    });

    this._ffmpegProcess.on('error', (err) => {
      console.error('❌ FFmpeg spawn error:', err);
      this._isRunning = false;
    });

    // Start segment watchdog
    this._lastSegmentTime = Date.now();
    this._startWatchdog(rtspUrl);
  }

  /**
   * Watchdog: checks that FFmpeg is still producing segments.
   * If no new segment arrives within the timeout, kill and restart.
   */
  private _startWatchdog(rtspUrl: string): void {
    this._stopWatchdog();
    this._watchdogTimer = setInterval(() => {
      if (!this._isRunning || !this._ffmpegProcess) return;

      const elapsed = Date.now() - this._lastSegmentTime;
      if (elapsed > this._watchdogTimeoutMs) {
        console.warn(
          `⏱️ Stream watchdog: no new segment for ${Math.round(
            elapsed / 1000
          )}s — restarting FFmpeg`
        );
        // Kill stalled process; the 'close' handler will restart
        this._ffmpegProcess?.kill('SIGKILL');
      }
    }, 10_000); // check every 10s
  }

  /**
   * Stop the watchdog timer
   */
  private _stopWatchdog(): void {
    if (this._watchdogTimer) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  /**
   * Remove all .m3u8 and .ts files from the HLS directory so the player
   * doesn't serve stale segments from a previous FFmpeg run.
   */
  private _cleanHlsDir(): void {
    try {
      const files = readdirSync(this._hlsDir).filter(
        (f) => f.endsWith('.m3u8') || f.endsWith('.ts')
      );
      for (const file of files) {
        try {
          unlinkSync(join(this._hlsDir, file));
        } catch {
          // ignore individual failures
        }
      }
      if (files.length > 0) {
        console.log(`🧹 Cleaned ${files.length} stale HLS files`);
      }
    } catch {
      // directory may not exist yet
    }
  }
}
