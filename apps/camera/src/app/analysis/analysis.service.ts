import { inject } from '@ee/di';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import { WebSocketService } from '../websocket/websocket.service';
import {
  SceneAnalysis,
  SceneEntity,
  AnomalyRating,
  AnalysisSettingsEntity,
  AnalysisSettings,
  UpdateAnalysisSettings,
} from './analysis.entity';

const OLLAMA_SCHEMA = {
  type: 'object',
  properties: {
    timestamp: { type: ['string', 'null'] },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['person', 'vehicle', 'animal', 'object'] },
          description: { type: 'string' },
          location: { type: 'string' },
          activity: { type: 'string' },
          anomaly_score: { type: 'integer', minimum: 0, maximum: 10 },
          anomaly_reason: { type: ['string', 'null'] },
        },
        required: ['type', 'description', 'location', 'activity', 'anomaly_score', 'anomaly_reason'],
      },
    },
    overall_score: { type: 'integer', minimum: 0, maximum: 10 },
    overall_rating: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    summary: { type: 'string' },
  },
  required: ['timestamp', 'entities', 'overall_score', 'overall_rating', 'summary'],
} as const;

/**
 * AnalysisService sends detection snapshots to an Ollama vision model
 * for scene analysis. Results are stored in the database and emitted
 * via WebSocket to connected clients.
 */
export class AnalysisService {
  private readonly _db = inject(Database);
  private readonly _wsService = inject(WebSocketService);
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
    console.log('🔬 Analysis settings updated');

    return this.getSettings();
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

    const prompt = `You are a security camera analysis system.

KNOWN BASELINE — do not flag these as anomalies:
${baseline}

Analyze this frame. Report only notable entities (people, animals, active vehicles). Omit static parked cars unless anomalous.
Anomaly score: 0=normal, 1-3=present but expected, 4-6=mildly suspicious, 7-9=concerning, 10=critical.
Location format: left/center/right + near/mid/far (e.g. "center-right-near"). /no_think`;

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

      let parsed: {
        summary: string;
        overall_score: number;
        overall_rating: AnomalyRating;
        entities: SceneEntity[];
      };

      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn('Ollama response was not valid JSON, storing as plain text');
        parsed = {
          summary: raw,
          overall_score: 0,
          overall_rating: 'LOW',
          entities: [],
        };
      }

      const durationMs = Date.now() - startTime;

      const analysis = this._repository.create({
        detectionEventId: params.detectionEventId,
        label: params.label,
        model,
        description: parsed.summary,
        overallScore: parsed.overall_score ?? null,
        overallRating: parsed.overall_rating ?? null,
        entities: parsed.entities ?? null,
        durationMs,
        snapshotFilename: params.snapshotFilename,
      });

      const saved = await this._repository.save(analysis);

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
      });

      console.log(
        `🔬 Analysis complete for ${params.label} in ${durationMs}ms [${saved.overallRating ?? 'UNKNOWN'} / ${saved.overallScore ?? '?'}/10]: "${parsed.summary.slice(0, 80)}"`
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
