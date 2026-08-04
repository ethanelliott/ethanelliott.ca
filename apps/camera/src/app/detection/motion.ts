/**
 * Layer 0 of the detection cascade: is anything moving at all?
 *
 * Object detection runs on every frame today, whether the lot is empty or
 * not. Differencing a tiny greyscale copy of the frame costs orders of
 * magnitude less than an inference pass, so gating on it makes an idle scene
 * nearly free — and the headroom that frees is what pays for running the
 * detector *faster* when something is actually happening.
 *
 * This layer deliberately knows nothing about objects. It only answers
 * "has the picture changed", and is wrong in both directions often enough
 * that the caller must never treat a negative as proof of an empty scene.
 */
export interface MotionResult {
  moving: boolean;
  /** Fraction of sampled pixels that changed */
  ratio: number;
  /** Set when the frame was rejected as a global change rather than an object */
  globalShift: boolean;
}

/** Width/height the frame is reduced to before differencing. */
const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const SAMPLE_PIXELS = SAMPLE_WIDTH * SAMPLE_HEIGHT;

export class MotionDetector {
  /** Rolling greyscale reference the current frame is compared against. */
  private _reference: Uint8Array | null = null;

  /** Per-pixel intensity delta that counts as changed (0–255). */
  private readonly _pixelDelta = parseInt(
    process.env.MOTION_PIXEL_DELTA || '24',
    10
  );

  /**
   * Fraction of the frame that must change to count as motion. At 160x90 the
   * default is a little over fifty pixels — roughly a person at the far end
   * of a parking lot.
   */
  private readonly _minRatio = parseFloat(
    process.env.MOTION_MIN_RATIO || '0.004'
  );

  /**
   * Above this, the whole picture moved: auto-exposure, headlights sweeping,
   * or the camera itself. Treated as no motion rather than as a giant object,
   * and the reference is resynced so the next frame compares against reality.
   */
  private readonly _maxRatio = parseFloat(
    process.env.MOTION_MAX_RATIO || '0.4'
  );

  /**
   * How fast the reference blends toward the current frame. Slow enough that
   * someone standing still is not absorbed within a few seconds, fast enough
   * to follow the sun. Subjects that do go static are covered by the caller
   * keeping the detector awake while any track is alive.
   */
  private readonly _blend = parseFloat(process.env.MOTION_BLEND || '0.02');

  constructor(private readonly _sharp: any) {}

  /**
   * Compare a JPEG frame against the rolling reference.
   * The first call has nothing to compare against and reports motion, so the
   * detector gets one pass to establish what is already in the scene.
   */
  async check(frame: Buffer): Promise<MotionResult> {
    let sample: Uint8Array;
    try {
      const { data } = await this._sharp(frame)
        .resize(SAMPLE_WIDTH, SAMPLE_HEIGHT, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      sample = new Uint8Array(data.buffer, data.byteOffset, SAMPLE_PIXELS);
    } catch {
      // A frame we cannot read is not evidence of stillness.
      return { moving: true, ratio: 1, globalShift: false };
    }

    const reference = this._reference;
    if (!reference) {
      this._reference = Uint8Array.from(sample);
      return { moving: true, ratio: 1, globalShift: false };
    }

    let changed = 0;
    for (let i = 0; i < SAMPLE_PIXELS; i++) {
      const delta = sample[i] - reference[i];
      if (delta > this._pixelDelta || delta < -this._pixelDelta) changed++;
    }
    const ratio = changed / SAMPLE_PIXELS;

    if (ratio > this._maxRatio) {
      // Snap rather than blend: the old reference describes a scene that no
      // longer exists, and blending would report motion for many frames.
      this._reference = Uint8Array.from(sample);
      return { moving: false, ratio, globalShift: true };
    }

    for (let i = 0; i < SAMPLE_PIXELS; i++) {
      reference[i] += (sample[i] - reference[i]) * this._blend;
    }

    return { moving: ratio >= this._minRatio, ratio, globalShift: false };
  }

  /** Forget the reference — used when the stream restarts. */
  reset(): void {
    this._reference = null;
  }
}
