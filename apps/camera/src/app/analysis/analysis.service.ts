import { inject } from '@ee/di';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import { WebSocketService } from '../websocket/websocket.service';
import { NotificationService } from '../notification/notification.service';
import {
  SceneAnalysis,
  SceneEntity,
  AnalysisSettingsEntity,
  AnalysisSettings,
  UpdateAnalysisSettings,
} from './analysis.entity';
import {
  LIGHTING_CONDITIONS,
  NOTIFY_TRIGGERS,
  SCENE_ACTIVITIES,
  THREAT_LEVELS,
  VISIBILITY_LEVELS,
  ratingFromThreat,
  scoreFromThreat,
} from './taxonomy';
import type {
  LightingCondition,
  NotifyTrigger,
  SceneActivity,
  ThreatLevel,
  VisibilityLevel,
} from './taxonomy';

/**
 * Structured output contract for the vision model.
 *
 * Every judgement is a closed enum. Asking for a 0–10 anomaly score reads as
 * more precise than it is: the model clusters on a few values, moves between
 * runs on the same frame, and leaves nothing a notification rule can test.
 * Named categories are stable, and `triggers` in particular gives a rule
 * something concrete to match on instead of a threshold on a fuzzy number.
 */
const OLLAMA_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    activity: { type: 'string', enum: [...SCENE_ACTIVITIES] },
    threat: { type: 'string', enum: [...THREAT_LEVELS] },
    triggers: {
      type: 'array',
      items: { type: 'string', enum: [...NOTIFY_TRIGGERS] },
    },
    notify: { type: 'boolean' },
    notify_reason: { type: ['string', 'null'] },
    lighting: { type: 'string', enum: [...LIGHTING_CONDITIONS] },
    visibility: { type: 'string', enum: [...VISIBILITY_LEVELS] },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['person', 'vehicle', 'animal', 'object'],
          },
          description: { type: 'string' },
          location: { type: 'string' },
          activity: { type: 'string' },
          anomaly_score: { type: 'integer', minimum: 0, maximum: 10 },
          anomaly_reason: { type: ['string', 'null'] },
        },
        required: [
          'type',
          'description',
          'location',
          'activity',
          'anomaly_score',
          'anomaly_reason',
        ],
      },
    },
  },
  required: [
    'summary',
    'activity',
    'threat',
    'triggers',
    'notify',
    'notify_reason',
    'lighting',
    'visibility',
    'entities',
  ],
} as const;

/** Shape the model is contracted to return, before it is trusted. */
interface AnalysisResponse {
  summary: string;
  activity: SceneActivity;
  threat: ThreatLevel;
  triggers: NotifyTrigger[];
  notify: boolean;
  notify_reason: string | null;
  lighting: LightingCondition;
  visibility: VisibilityLevel;
  entities: SceneEntity[];
}

/**
 * AnalysisService sends detection snapshots to an Ollama vision model
 * for scene analysis. Results are stored in the database and emitted
 * via WebSocket to connected clients.
 */
export class AnalysisService {
  private readonly _db = inject(Database);
  private readonly _wsService = inject(WebSocketService);
  private readonly _notificationService = inject(NotificationService);
  private readonly _repository = this._db.repositoryFor(SceneAnalysis);
  private readonly _settingsRepo = this._db.repositoryFor(
    AnalysisSettingsEntity
  );

  /** In-memory cache of settings */
  private _settings: AnalysisSettingsEntity | null = null;

  /** Per-label timestamp of the last analysis sent (cooldown tracker) */
  private readonly _lastAnalyzed = new Map<string, number>();

  /** Track in-flight analyses to prevent duplicates */
  private readonly _inFlight = new Set<string>();

  private readonly _ollamaUrl =
    process.env.OLLAMA_URL ||
    'http://ollama.elliott-haus.svc.cluster.local:11434';

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
   * Load settings from DB (or create defaults). Called once during startup.
   */
  async initialize(): Promise<void> {
    try {
      let row = await this._settingsRepo.findOne({ where: {} });
      if (!row) {
        row = this._settingsRepo.create({
          enabled: true,
          model: process.env.OLLAMA_MODEL || 'qwen3-vl:4b',
          prompt:
            'Parked cars, SUVs, trucks in the lot. Residential apartment buildings, trees, grass, sidewalks. Normal ambient lighting.',
          cooldownSeconds: 30,
          analyzeLabels: ['person', 'car', 'dog', 'cat'],
          minConfidence: 0.7,
        });
        await this._settingsRepo.save(row);
        console.log('🔬 Initialized default analysis settings');
      }
      this._settings = row;
      this._notificationService.setAnalysisAvailable(row.enabled);

      // Verify Ollama connectivity
      try {
        const resp = await fetch(`${this._ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { models?: { name: string }[] };
          const models = data.models?.map((m) => m.name) ?? [];
          console.log(
            `🔬 Ollama connected at ${this._ollamaUrl} (models: ${
              models.join(', ') || 'none'
            })`
          );

          // Check if the configured model is available
          const configuredModel = this._settings.model;
          if (!models.some((m) => m.startsWith(configuredModel))) {
            console.warn(
              `⚠️ Model "${configuredModel}" not found on Ollama. Available: ${models.join(
                ', '
              )}. Pulling...`
            );
            this._pullModel(configuredModel).catch((err) =>
              console.error(`Failed to pull model ${configuredModel}:`, err)
            );
          }
        } else {
          console.warn(
            `⚠️ Ollama health check failed (${resp.status}). Analysis may not work.`
          );
        }
      } catch (err) {
        console.warn(
          `⚠️ Cannot reach Ollama at ${this._ollamaUrl}. Scene analysis will retry on demand.`
        );
      }

      console.log(
        `🔬 Scene analysis ${
          this._settings.enabled ? 'ENABLED' : 'disabled'
        } → ${this._ollamaUrl} (model: ${this._settings.model})`
      );
    } catch (err) {
      console.error('Failed to load analysis settings:', err);
    }
  }

  /**
   * Handle a new detection event. If analysis is enabled and the label
   * qualifies, send the snapshot to Ollama for scene analysis.
   *
   * This method is fire-and-forget — it does not block the detection loop.
   */
  async onDetection(params: {
    detectionEventId: string;
    label: string;
    confidence: number;
    snapshotFilename: string | null;
  }): Promise<void> {
    if (!this._settings?.enabled) return;
    if (!params.snapshotFilename) return;

    // Check confidence threshold
    if (params.confidence < (this._settings.minConfidence ?? 0.7)) return;

    // Check if this label should trigger analysis
    const analyzeLabels = this._settings.analyzeLabels ?? [];
    if (analyzeLabels.length > 0 && !analyzeLabels.includes(params.label)) {
      return;
    }

    // Check cooldown for this label
    const now = Date.now();
    const lastTime = this._lastAnalyzed.get(params.label) ?? 0;
    const cooldownMs = (this._settings.cooldownSeconds ?? 30) * 1000;
    if (now - lastTime < cooldownMs) return;

    // Prevent duplicate in-flight requests for the same detection event
    if (this._inFlight.has(params.detectionEventId)) return;

    this._lastAnalyzed.set(params.label, now);
    this._inFlight.add(params.detectionEventId);

    try {
      await this._analyzeSnapshot(params);
    } catch (err) {
      console.error('Scene analysis error:', err);
    } finally {
      this._inFlight.delete(params.detectionEventId);
    }
  }

  /**
   * Get analysis results with pagination
   */
  async getAnalyses(options: {
    limit?: number;
    offset?: number;
    detectionEventId?: string;
    label?: string;
  }): Promise<{ analyses: SceneAnalysis[]; total: number }> {
    const qb = this._repository.createQueryBuilder('analysis');

    if (options.detectionEventId) {
      qb.andWhere('analysis.detectionEventId = :id', {
        id: options.detectionEventId,
      });
    }

    if (options.label) {
      qb.andWhere('analysis.label = :label', { label: options.label });
    }

    qb.orderBy('analysis.timestamp', 'DESC');

    const total = await qb.getCount();

    qb.skip(options.offset || 0);
    qb.take(options.limit || 50);

    const analyses = await qb.getMany();

    return { analyses, total };
  }

  /**
   * Get a specific analysis by ID
   */
  async getById(id: string): Promise<SceneAnalysis | null> {
    return this._repository.findOne({ where: { id } });
  }

  /**
   * Get the analysis for a specific detection event
   */
  async getByDetectionEventId(
    detectionEventId: string
  ): Promise<SceneAnalysis | null> {
    return this._repository.findOne({ where: { detectionEventId } });
  }

  /**
   * Get current settings
   */
  getSettings(): AnalysisSettings {
    const s = this._settings;
    return {
      enabled: s?.enabled ?? true,
      model: s?.model ?? 'qwen3-vl:4b',
      prompt: s?.prompt ?? 'Parked cars, SUVs, trucks in the lot. Residential apartment buildings, trees, grass, sidewalks. Normal ambient lighting.',
      cooldownSeconds: s?.cooldownSeconds ?? 30,
      analyzeLabels: s?.analyzeLabels ?? ['person', 'car', 'dog', 'cat'],
      minConfidence: s?.minConfidence ?? 0.7,
    };
  }

  /**
   * Update settings
   */
  async updateSettings(
    updates: UpdateAnalysisSettings
  ): Promise<AnalysisSettings> {
    if (!this._settings) {
      throw new Error('Analysis settings not initialized');
    }

    if (updates.enabled !== undefined) this._settings.enabled = updates.enabled;
    if (updates.model !== undefined) this._settings.model = updates.model;
    if (updates.prompt !== undefined) this._settings.prompt = updates.prompt;
    if (updates.cooldownSeconds !== undefined)
      this._settings.cooldownSeconds = updates.cooldownSeconds;
    if (updates.analyzeLabels !== undefined)
      this._settings.analyzeLabels = updates.analyzeLabels;
    if (updates.minConfidence !== undefined)
      this._settings.minConfidence = updates.minConfidence;

    await this._settingsRepo.save(this._settings);
    this._notificationService.setAnalysisAvailable(this._settings.enabled);
    console.log('🔬 Analysis settings updated');

    return this.getSettings();
  }

  /**
   * Build the classification prompt.
   *
   * Each enum value is spelled out with the condition that selects it. Left to
   * infer what `person_loitering` or `suspicious` mean, the model picks a
   * plausible reading and picks a different one on the next frame; naming the
   * test is what makes the labels reproducible enough to trigger on.
   */
  private _buildPrompt(baseline: string, detectedLabel: string): string {
    return `You are a security camera analyst. Classify a single frame.

WHAT IS NORMAL HERE — never treat these as suspicious on their own:
${baseline}

An object detector already found: ${detectedLabel}. Describe what it is DOING.

activity — pick the one that fits best:
  nothing_notable         nothing worth logging
  person_passing          walking through, not stopping or diverting
  person_loitering        stationary or circling with no apparent purpose
  person_approaching      moving toward a building, door, or the camera
  person_at_entrance      at a door, gate, or entryway
  person_with_package     carrying or handling a parcel
  person_at_vehicle       standing at, leaning into, or entering a vehicle
  group_gathering         three or more people together
  vehicle_passing         driving through without stopping
  vehicle_arriving        pulling in or parking
  vehicle_departing       pulling out or leaving
  vehicle_parked_occupied someone is sitting inside a parked vehicle
  delivery                courier or delivery vehicle dropping something off
  animal_present          an animal is the subject
  view_obstructed         the lens is blocked, sprayed, or covered
  other                   none of the above

threat — how much attention this deserves:
  benign      matches what is normal here
  notable     worth having in the log; no action needed
  suspicious  out of place for the time or location; deserves a look
  critical    someone is being harmed, or a break-in is in progress

triggers — list EVERY condition that is clearly true. Empty list if none:
  person_after_dark            a person present and the scene is dusk or night
  loitering                    remaining without apparent purpose
  approaching_entrance         heading toward a door, gate, or entryway
  trying_doors_or_handles      touching or pulling at handles, doors, windows
  looking_into_vehicles        peering into or through vehicle windows
  package_interaction          picking up, moving, or opening a parcel
  face_concealed               face hidden by a mask, hood, or covering
  multiple_people              two or more people together
  carrying_large_object        carrying something bulky or awkward
  unfamiliar_vehicle           a vehicle inconsistent with what is normal here
  vehicle_occupied_after_dark  someone inside a parked vehicle at dusk or night
  large_animal                 an animal bigger than a domestic dog
  camera_obstructed            the view is blocked or tampered with

notify — true only if this is worth interrupting someone for. A person simply
walking past in daylight is not. Set notify_reason to one short clause when
true, otherwise null.

visibility — poor means you cannot reliably tell what is happening. Say poor
rather than guessing, and keep threat at benign or notable when you do.

Report entities for people, animals, and active vehicles only. Skip parked
cars unless something is happening at them. Location format: left/center/right
plus near/mid/far, e.g. "center-right-near". /no_think`;
  }

  /**
   * Send a snapshot to Ollama for scene analysis.
   */
  private async _analyzeSnapshot(params: {
    detectionEventId: string;
    label: string;
    confidence: number;
    snapshotFilename: string | null;
  }): Promise<void> {
    if (!params.snapshotFilename) return;

    const snapshotPath = join(this._snapshotDir, params.snapshotFilename);
    let imageBuffer: Buffer;
    try {
      imageBuffer = readFileSync(snapshotPath);
    } catch (err) {
      console.error(
        `Cannot read snapshot for analysis: ${params.snapshotFilename}`,
        err
      );
      return;
    }

    const base64Image = imageBuffer.toString('base64');
    const model = this._settings?.model ?? 'qwen3-vl:4b';
    const baseline =
      this._settings?.prompt ??
      'Parked cars, SUVs, trucks in the lot. Residential apartment buildings, trees, grass, sidewalks. Normal ambient lighting.';

    const prompt = this._buildPrompt(baseline, params.label);

    console.log(
      `🔬 Analyzing ${params.label} detection (${params.snapshotFilename}) with ${model}...`
    );

    const startTime = Date.now();

    try {
      const response = await fetch(`${this._ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          images: [base64Image],
          stream: false,
          format: OLLAMA_SCHEMA,
          options: { temperature: 0 },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(
          `Ollama API error (${response.status}): ${body.slice(0, 200)}`
        );
        return;
      }

      // qwen3-vl places structured output in 'thinking' when format schema is set
      const result = (await response.json()) as {
        response?: string;
        thinking?: string;
      };
      const raw = (result.response || result.thinking || '').trim();

      if (!raw) {
        console.warn('Ollama returned empty analysis');
        return;
      }

      const parsed = this._parseResponse(raw);
      const durationMs = Date.now() - startTime;

      // A frame the model could not read is not evidence of calm — cap its
      // severity so an obscured lens cannot report itself as benign.
      const threat =
        parsed.visibility === 'poor' && parsed.threat === 'critical'
          ? 'suspicious'
          : parsed.threat;

      const analysis = this._repository.create({
        detectionEventId: params.detectionEventId,
        label: params.label,
        model,
        description: parsed.summary,
        // Derived from the classification so existing filters and the score
        // display keep working against rows written under either schema.
        overallScore: scoreFromThreat(threat),
        overallRating: ratingFromThreat(threat),
        entities: parsed.entities.length ? parsed.entities : null,
        durationMs,
        snapshotFilename: params.snapshotFilename,
        activity: parsed.activity,
        threat,
        triggers: parsed.triggers,
        notifyRecommended: parsed.notify,
        notifyReason: parsed.notify_reason,
        lighting: parsed.lighting,
        visibility: parsed.visibility,
        notified: false,
      });

      const saved = await this._repository.save(analysis);

      // The notification decision belongs to the analysis, not the raw
      // detection: "person, 87%" cannot tell you whether to care.
      const notified = await this._notificationService.onAnalysis({
        label: params.label,
        confidence: params.confidence,
        snapshotFilename: params.snapshotFilename,
        summary: saved.description,
        activity: saved.activity,
        threat: saved.threat,
        triggers: saved.triggers ?? [],
        notifyRecommended: saved.notifyRecommended ?? false,
        notifyReason: saved.notifyReason,
      });

      if (notified) {
        saved.notified = true;
        await this._repository.save(saved);
      }

      this._wsService.emitSceneAnalysis({
        id: saved.id,
        timestamp: saved.timestamp,
        detectionEventId: saved.detectionEventId,
        label: saved.label,
        model: saved.model,
        description: saved.description,
        overallScore: saved.overallScore,
        overallRating: saved.overallRating,
        entities: saved.entities,
        durationMs: saved.durationMs,
        snapshotFilename: saved.snapshotFilename,
        activity: saved.activity,
        threat: saved.threat,
        triggers: saved.triggers,
        notifyRecommended: saved.notifyRecommended,
        notifyReason: saved.notifyReason,
        lighting: saved.lighting,
        visibility: saved.visibility,
        notified: saved.notified,
      });

      console.log(
        `🔬 Analysis complete for ${params.label} in ${durationMs}ms ` +
          `[${threat} / ${saved.activity}${
            saved.triggers?.length ? ` / ${saved.triggers.join(',')}` : ''
          }${notified ? ' / NOTIFIED' : ''}]: "${parsed.summary.slice(0, 80)}"`
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        console.error(
          `Ollama analysis timed out for ${params.snapshotFilename}`
        );
      } else {
        throw err;
      }
    }
  }

  /**
   * Parse and validate the model's reply.
   *
   * The schema constrains generation but does not guarantee it: a model can
   * still emit a value outside an enum, drop a field, or return prose. Rather
   * than store a bad label that a notification rule would then match on,
   * anything unrecognised falls back to the inert value.
   */
  private _parseResponse(raw: string): AnalysisResponse {
    let json: Partial<AnalysisResponse>;
    try {
      json = JSON.parse(raw);
    } catch {
      console.warn('Ollama response was not valid JSON, keeping it as prose');
      return {
        summary: raw.slice(0, 500),
        activity: 'other',
        threat: 'benign',
        triggers: [],
        notify: false,
        notify_reason: null,
        lighting: 'daylight',
        visibility: 'poor',
        entities: [],
      };
    }

    const oneOf = <T extends string>(
      value: unknown,
      allowed: readonly T[],
      fallback: T
    ): T => (allowed.includes(value as T) ? (value as T) : fallback);

    const triggers = Array.isArray(json.triggers)
      ? json.triggers.filter((t): t is NotifyTrigger =>
          NOTIFY_TRIGGERS.includes(t as NotifyTrigger)
        )
      : [];

    return {
      summary:
        typeof json.summary === 'string' && json.summary.trim()
          ? json.summary.trim()
          : 'No description returned.',
      activity: oneOf(json.activity, SCENE_ACTIVITIES, 'other'),
      threat: oneOf(json.threat, THREAT_LEVELS, 'benign'),
      triggers: [...new Set(triggers)],
      notify: json.notify === true,
      notify_reason:
        typeof json.notify_reason === 'string' && json.notify_reason.trim()
          ? json.notify_reason.trim()
          : null,
      lighting: oneOf(json.lighting, LIGHTING_CONDITIONS, 'daylight'),
      visibility: oneOf(json.visibility, VISIBILITY_LEVELS, 'clear'),
      entities: Array.isArray(json.entities) ? json.entities : [],
    };
  }

  /**
   * Pull a model from Ollama if it's not already available.
   */
  private async _pullModel(modelName: string): Promise<void> {
    console.log(`🔬 Pulling model ${modelName} from Ollama...`);
    try {
      const response = await fetch(`${this._ollamaUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false }),
        signal: AbortSignal.timeout(600_000), // 10 min timeout for model pull
      });

      if (response.ok) {
        console.log(`✅ Model ${modelName} pulled successfully`);
      } else {
        const body = await response.text();
        console.error(
          `Failed to pull model ${modelName}: ${response.status} ${body.slice(
            0,
            200
          )}`
        );
      }
    } catch (err) {
      console.error(`Error pulling model ${modelName}:`, err);
    }
  }
}
