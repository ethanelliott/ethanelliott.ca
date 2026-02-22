import { ChildProcess, spawn } from 'child_process';
import { inject } from '@ee/di';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
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

    const rtspUrl = await this._cameraService.getRtspUrl();
    this._restartAttempts = 0;
    this._startFfmpeg(rtspUrl);
  }

  /**
   * Stop the FFmpeg process
   */
  stop(): void {
    this._isRunning = false;
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
      'delete_segments+append_list',
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
  }
}
