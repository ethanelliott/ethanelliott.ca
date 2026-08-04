import { randomUUID } from 'node:crypto';

export interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Observation {
  label: string;
  confidence: number;
  bbox: Bbox;
}

/**
 * Facts derived from watching a subject over time, handed to the vision model
 * alongside the frame.
 *
 * This exists because the classification the model is asked for is not
 * answerable from a still image. Whether someone is passing through,
 * approaching, or loitering is a statement about a trajectory — given one
 * frame the model can only guess, and it does. Measuring dwell and approach
 * here turns those categories into something close to arithmetic.
 */
export interface EpisodeContext {
  durationSec: number;
  /** Plain-language path across the frame, e.g. "left edge → centre, stopped" */
  trajectory: string;
  approach: 'toward' | 'away' | 'lateral' | 'stationary';
  /** Fraction of observations where the subject barely moved */
  dwellRatio: number;
  /** Other subjects tracked at the same time */
  concurrentSubjects: number;
  /** Which analysis pass this is; later passes have watched for longer */
  round: number;
}

/**
 * Escalating re-analysis schedule, in seconds from when the track started.
 *
 * The first pass is early so an alert is not held until the subject leaves.
 * Later passes exist so a lingering presence escalates on its own: the same
 * person re-read at two minutes has a dwell time that reads as loitering
 * where the three-second read could only say "person present".
 */
const ANALYSIS_SCHEDULE = [3, 30, 120, 300];
/** Interval for passes beyond the schedule, so an all-night presence settles. */
const ANALYSIS_TAIL_INTERVAL = 600;

/** Centre displacement (as a fraction of the frame) counted as movement. */
const MOVEMENT_EPSILON = 0.012;

export class Track {
  readonly id = randomUUID();
  readonly startedAt = Date.now();

  /** DB row id, set once the track is confirmed and an event is written. */
  eventId: string | null = null;
  snapshotFilename: string | null = null;

  bbox: Bbox;
  confidence: number;
  frameWidth: number;
  frameHeight: number;

  lastSeen = Date.now();
  /** Frames matched to this track; a track is only real after several. */
  hits = 1;
  /** Consecutive frames with no match — the track is coasting. */
  misses = 0;
  confirmed = false;

  /** Pixels per second, used to predict where the subject will be next. */
  velocityX = 0;
  velocityY = 0;

  /** Best frame seen so far, and what made it the best. */
  bestScore = -1;
  bestFrame: Buffer | null = null;

  /** Trajectory bookkeeping, all in normalised 0–1 frame coordinates. */
  private readonly _firstCentre: { x: number; y: number };
  private _lastCentre: { x: number; y: number };
  private readonly _firstArea: number;
  private _maxArea: number;
  private _movingSamples = 0;
  private _stillSamples = 0;

  analysisRound = 0;
  /** Epoch ms at which the next analysis pass is due. */
  nextAnalysisAt: number;

  constructor(
    readonly label: string,
    observation: Observation,
    frameWidth: number,
    frameHeight: number
  ) {
    this.bbox = observation.bbox;
    this.confidence = observation.confidence;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;

    const centre = normalisedCentre(observation.bbox, frameWidth, frameHeight);
    this._firstCentre = centre;
    this._lastCentre = centre;
    this._firstArea = normalisedArea(observation.bbox, frameWidth, frameHeight);
    this._maxArea = this._firstArea;

    this.nextAnalysisAt = this.startedAt + ANALYSIS_SCHEDULE[0] * 1000;
  }

  get durationSec(): number {
    return (this.lastSeen - this.startedAt) / 1000;
  }

  /** Fold in a frame where this track was matched. */
  update(
    observation: Observation,
    frameWidth: number,
    frameHeight: number,
    frame: Buffer | null
  ): void {
    const now = Date.now();
    const dtSec = Math.max((now - this.lastSeen) / 1000, 0.001);

    const previous = this.bbox;
    this.velocityX = (observation.bbox.x - previous.x) / dtSec;
    this.velocityY = (observation.bbox.y - previous.y) / dtSec;

    this.bbox = observation.bbox;
    this.confidence = observation.confidence;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.lastSeen = now;
    this.hits++;
    this.misses = 0;

    const centre = normalisedCentre(observation.bbox, frameWidth, frameHeight);
    const travelled = Math.hypot(
      centre.x - this._lastCentre.x,
      centre.y - this._lastCentre.y
    );
    if (travelled > MOVEMENT_EPSILON) {
      this._movingSamples++;
    } else {
      this._stillSamples++;
    }
    this._lastCentre = centre;
    this._maxArea = Math.max(
      this._maxArea,
      normalisedArea(observation.bbox, frameWidth, frameHeight)
    );

    if (frame) this._considerFrame(frame, observation, frameWidth, frameHeight);
  }

  /** Where the subject is predicted to be now, given its last velocity. */
  predictedBbox(): Bbox {
    const dtSec = (Date.now() - this.lastSeen) / 1000;
    return {
      x: this.bbox.x + this.velocityX * dtSec,
      y: this.bbox.y + this.velocityY * dtSec,
      width: this.bbox.width,
      height: this.bbox.height,
    };
  }

  /** True when enough time has passed for the next analysis pass. */
  isAnalysisDue(now = Date.now()): boolean {
    return this.confirmed && now >= this.nextAnalysisAt;
  }

  /** Advance the schedule after an analysis has been queued. */
  markAnalysisQueued(): void {
    this.analysisRound++;
    const next = ANALYSIS_SCHEDULE[this.analysisRound];
    const offsetSec =
      next ??
      ANALYSIS_SCHEDULE[ANALYSIS_SCHEDULE.length - 1] +
        ANALYSIS_TAIL_INTERVAL *
          (this.analysisRound - ANALYSIS_SCHEDULE.length + 1);
    this.nextAnalysisAt = this.startedAt + offsetSec * 1000;
  }

  context(concurrentSubjects: number): EpisodeContext {
    const samples = this._movingSamples + this._stillSamples;
    const dwellRatio = samples > 0 ? this._stillSamples / samples : 0;

    return {
      durationSec: Math.round(this.durationSec * 10) / 10,
      trajectory: this._describeTrajectory(dwellRatio),
      approach: this._describeApproach(),
      dwellRatio: Math.round(dwellRatio * 100) / 100,
      concurrentSubjects,
      round: this.analysisRound + 1,
    };
  }

  /**
   * Keep the frame that shows the subject best.
   *
   * Size dominates because a subject twice as large carries roughly twice the
   * detail the model needs, and centrality matters because a bbox against the
   * frame edge is usually a subject half out of shot. This is what makes the
   * left-edge and right-edge frames of a crossing lose to the middle one.
   */
  private _considerFrame(
    frame: Buffer,
    observation: Observation,
    frameWidth: number,
    frameHeight: number
  ): void {
    const area = normalisedArea(observation.bbox, frameWidth, frameHeight);
    const centre = normalisedCentre(observation.bbox, frameWidth, frameHeight);

    const centrality =
      1 - 2 * Math.max(Math.abs(centre.x - 0.5), Math.abs(centre.y - 0.5));
    const clipped =
      observation.bbox.x <= 1 ||
      observation.bbox.y <= 1 ||
      observation.bbox.x + observation.bbox.width >= frameWidth - 1 ||
      observation.bbox.y + observation.bbox.height >= frameHeight - 1;

    // Square-rooted because apparent area falls off with the square of
    // distance, which would otherwise swamp the other two terms.
    const score =
      (0.45 * Math.sqrt(area) +
        0.35 * Math.max(centrality, 0) +
        0.2 * observation.confidence) *
      (clipped ? 0.5 : 1);

    if (score > this.bestScore) {
      this.bestScore = score;
      this.bestFrame = frame;
    }
  }

  private _describeTrajectory(dwellRatio: number): string {
    const from = describePosition(this._firstCentre);
    const to = describePosition(this._lastCentre);
    const displacement = Math.hypot(
      this._lastCentre.x - this._firstCentre.x,
      this._lastCentre.y - this._firstCentre.y
    );

    if (displacement < 0.05) {
      return `stayed at ${from} for ${this.durationSec.toFixed(0)}s`;
    }

    const path = `${from} → ${to}`;
    if (dwellRatio > 0.5) return `${path}, stopping along the way`;
    return path;
  }

  private _describeApproach(): EpisodeContext['approach'] {
    const growth = this._firstArea > 0 ? this._maxArea / this._firstArea : 1;
    const displacement = Math.hypot(
      this._lastCentre.x - this._firstCentre.x,
      this._lastCentre.y - this._firstCentre.y
    );

    if (growth > 1.4) return 'toward';
    if (growth < 0.7) return 'away';
    if (displacement < 0.05) return 'stationary';
    return 'lateral';
  }
}

/**
 * Associates detections across frames so one subject produces one event.
 *
 * The previous approach — greedy IoU against the last known box — breaks the
 * moment a subject moves far enough between frames that the boxes no longer
 * overlap, and every break minted a new event and another model call. Three
 * things fix that: predicting where the subject should be before matching,
 * scoring candidates on position and size rather than overlap alone, and
 * letting a track coast through the frames where the detector loses it.
 */
export class Tracker {
  private readonly _tracks = new Map<string, Track>();

  /** Frames a track may go unmatched before it is finalised. */
  private readonly _maxMisses = parseInt(
    process.env.TRACK_MAX_MISSES || '12',
    10
  );

  /** Matched frames before a track is real rather than a detector blip. */
  private readonly _minHits = parseInt(process.env.TRACK_MIN_HITS || '3', 10);

  /** Worst association cost still accepted as the same subject. */
  private readonly _maxCost = parseFloat(process.env.TRACK_MAX_COST || '0.72');

  get size(): number {
    return this._tracks.size;
  }

  get tracks(): Track[] {
    return [...this._tracks.values()];
  }

  /** Confirmed tracks only — what the live overlay should draw. */
  get confirmedTracks(): Track[] {
    return this.tracks.filter((track) => track.confirmed);
  }

  /**
   * Fold one frame of detections into the tracks.
   * Returns the tracks that just became confirmed and those that ended.
   */
  update(
    observations: Observation[],
    frameWidth: number,
    frameHeight: number,
    frame: Buffer | null
  ): { confirmed: Track[]; finished: Track[] } {
    const diagonal = Math.hypot(frameWidth, frameHeight);

    // Score every plausible pairing, then take them best-first. Cheaper than
    // an optimal assignment and, at these track counts, indistinguishable.
    const candidates: { cost: number; track: Track; index: number }[] = [];
    for (const track of this._tracks.values()) {
      for (let index = 0; index < observations.length; index++) {
        const observation = observations[index];
        if (observation.label !== track.label) continue;
        const cost = associationCost(track, observation, diagonal);
        if (cost <= this._maxCost) candidates.push({ cost, track, index });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost);

    const usedTracks = new Set<string>();
    const usedObservations = new Set<number>();
    for (const candidate of candidates) {
      if (usedTracks.has(candidate.track.id)) continue;
      if (usedObservations.has(candidate.index)) continue;
      usedTracks.add(candidate.track.id);
      usedObservations.add(candidate.index);
      candidate.track.update(
        observations[candidate.index],
        frameWidth,
        frameHeight,
        frame
      );
    }

    const confirmed: Track[] = [];
    for (const track of this._tracks.values()) {
      if (usedTracks.has(track.id)) {
        if (!track.confirmed && track.hits >= this._minHits) {
          track.confirmed = true;
          confirmed.push(track);
        }
      } else {
        track.misses++;
      }
    }

    for (let index = 0; index < observations.length; index++) {
      if (usedObservations.has(index)) continue;
      const observation = observations[index];
      const track = new Track(
        observation.label,
        observation,
        frameWidth,
        frameHeight
      );
      // Seed the best frame so a track that ends before its first analysis
      // still has an image to send.
      if (frame) {
        track.bestFrame = frame;
        track.bestScore = 0;
      }
      this._tracks.set(track.id, track);
    }

    const finished: Track[] = [];
    for (const [id, track] of this._tracks) {
      if (track.misses > this._maxMisses) {
        this._tracks.delete(id);
        finished.push(track);
      }
    }

    return { confirmed, finished };
  }

  /** Drop everything — used when the stream restarts. */
  clear(): Track[] {
    const remaining = this.tracks;
    this._tracks.clear();
    return remaining;
  }
}

/**
 * How unlike each other a track and a detection are, in 0–1.
 *
 * Overlap alone fails on fast movement, so position and size carry weight
 * too: a subject that jumped clear of its previous box still matches if it
 * landed near where its velocity said it would, at about the same size.
 */
function associationCost(
  track: Track,
  observation: Observation,
  diagonal: number
): number {
  const predicted = track.predictedBbox();

  const overlap = iou(predicted, observation.bbox);

  const predictedCentre = centreOf(predicted);
  const observedCentre = centreOf(observation.bbox);
  const distance = Math.hypot(
    predictedCentre.x - observedCentre.x,
    predictedCentre.y - observedCentre.y
  );
  const proximity = Math.max(0, 1 - distance / (diagonal * 0.25));

  const predictedArea = predicted.width * predicted.height;
  const observedArea = observation.bbox.width * observation.bbox.height;
  const similarity =
    predictedArea > 0 && observedArea > 0
      ? Math.min(predictedArea, observedArea) /
        Math.max(predictedArea, observedArea)
      : 0;

  return 1 - (0.6 * overlap + 0.25 * proximity + 0.15 * similarity);
}

function iou(a: Bbox, b: Bbox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function centreOf(bbox: Bbox): { x: number; y: number } {
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
}

function normalisedCentre(
  bbox: Bbox,
  frameWidth: number,
  frameHeight: number
): { x: number; y: number } {
  const centre = centreOf(bbox);
  return {
    x: frameWidth > 0 ? centre.x / frameWidth : 0.5,
    y: frameHeight > 0 ? centre.y / frameHeight : 0.5,
  };
}

function normalisedArea(
  bbox: Bbox,
  frameWidth: number,
  frameHeight: number
): number {
  const frameArea = frameWidth * frameHeight;
  return frameArea > 0 ? (bbox.width * bbox.height) / frameArea : 0;
}

function describePosition(centre: { x: number; y: number }): string {
  const horizontal =
    centre.x < 0.2
      ? 'left edge'
      : centre.x < 0.4
      ? 'left'
      : centre.x < 0.6
      ? 'centre'
      : centre.x < 0.8
      ? 'right'
      : 'right edge';
  const vertical = centre.y < 0.35 ? 'far' : centre.y < 0.7 ? 'mid' : 'near';
  return `${horizontal} ${vertical}`;
}
