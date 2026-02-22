import { spawn } from 'child_process';

/**
 * CameraService manages connection to the IP camera.
 * Discovers RTSP stream URL via ONVIF or uses configured fallback.
 */
export class CameraService {
  private _rtspUrl: string | null = null;
  private _cameraInfo: CameraInfo | null = null;

  /**
   * Get the RTSP stream URL. Tries ONVIF discovery first,
   * falls back to CAMERA_RTSP_URL env var.
   */
  async getRtspUrl(): Promise<string> {
    if (this._rtspUrl) {
      return this._rtspUrl;
    }

    // Try ONVIF discovery first
    try {
      this._rtspUrl = await this._discoverViaOnvif();
      console.log(`📹 ONVIF discovered RTSP URL: ${this._rtspUrl}`);
      return this._rtspUrl;
    } catch (err) {
      console.warn('⚠️ ONVIF discovery failed, using fallback:', err);
    }

    // Fall back to environment variable
    const fallbackUrl = process.env.CAMERA_RTSP_URL;
    if (fallbackUrl) {
      this._rtspUrl = fallbackUrl;
      console.log(`📹 Using configured RTSP URL: ${this._rtspUrl}`);
      return this._rtspUrl;
    }

    // Construct URL from individual env vars
    const ip = process.env.CAMERA_IP || '192.168.86.34';
    const port = process.env.CAMERA_RTSP_PORT || '554';
    const username = process.env.CAMERA_USERNAME || 'admin';
    const password = process.env.CAMERA_PASSWORD || '';
    const path = process.env.CAMERA_RTSP_PATH || '/stream1';

    this._rtspUrl = `rtsp://${username}:${password}@${ip}:${port}${path}`;
    console.log(
      `📹 Constructed RTSP URL: rtsp://${username}:***@${ip}:${port}${path}`
    );
    return this._rtspUrl;
  }

  /**
   * Get camera information
   */
  async getInfo(): Promise<CameraInfo> {
    if (this._cameraInfo) {
      return this._cameraInfo;
    }

    const ip = process.env.CAMERA_IP || '192.168.86.34';
    const rtspUrl = await this.getRtspUrl();

    this._cameraInfo = {
      ip,
      model: process.env.CAMERA_MODEL || 'Arenti a3',
      rtspUrl: rtspUrl.replace(/:[^:@]+@/, ':***@'), // mask password
      onvifPort: parseInt(process.env.CAMERA_ONVIF_PORT || '80', 10),
      status: 'unknown',
    };

    // Check if stream is reachable via FFprobe
    try {
      await this._probeStream(rtspUrl);
      this._cameraInfo.status = 'online';
    } catch {
      this._cameraInfo.status = 'offline';
    }

    return this._cameraInfo;
  }

  /**
   * Force re-discovery of the RTSP URL
   */
  async rediscover(): Promise<string> {
    this._rtspUrl = null;
    this._cameraInfo = null;
    return this.getRtspUrl();
  }

  /**
   * Discover stream URL via ONVIF protocol
   */
  private async _discoverViaOnvif(): Promise<string> {
    const ip = process.env.CAMERA_IP || '192.168.86.34';
    const onvifPort = parseInt(process.env.CAMERA_ONVIF_PORT || '80', 10);
    const username = process.env.CAMERA_USERNAME || 'admin';
    const password = process.env.CAMERA_PASSWORD || '';

    // Dynamic import to handle potential missing module
    const { Cam } = await import('onvif');

    return new Promise((resolve, reject) => {
      const cam = new Cam(
        {
          hostname: ip,
          port: onvifPort,
          username,
          password,
          timeout: 10000,
        },
        (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }

          cam.getStreamUri(
            { protocol: 'RTSP' },
            (err: Error | null, stream: { uri: string }) => {
              if (err) {
                reject(err);
                return;
              }
              // Inject credentials into the ONVIF-discovered URI
              // ONVIF often returns URLs without auth embedded
              try {
                const url = new URL(stream.uri);
                if (!url.username) {
                  url.username = username;
                  url.password = password;
                }
                resolve(url.toString());
              } catch {
                // If URL parsing fails, inject manually
                const authUrl = stream.uri.replace(
                  'rtsp://',
                  `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(
                    password
                  )}@`
                );
                resolve(authUrl);
              }
            }
          );
        }
      );
    });
  }

  /**
   * Probe an RTSP stream to check if it's reachable
   */
  private _probeStream(rtspUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffprobe', [
        '-v',
        'quiet',
        '-rtsp_transport',
        'tcp',
        '-i',
        rtspUrl,
        '-show_entries',
        'stream=codec_type',
        '-of',
        'csv=p=0',
      ]);

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('FFprobe timed out'));
      }, 10000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFprobe exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}

export interface CameraInfo {
  ip: string;
  model: string;
  rtspUrl: string;
  onvifPort: number;
  status: 'online' | 'offline' | 'unknown';
}
