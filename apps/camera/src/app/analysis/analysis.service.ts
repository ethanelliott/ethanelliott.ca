import { inject } from '@ee/di';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Database } from '../data-source';
import { WebSocketService } from '../websocket/websocket.service';
import {
  SceneAnalysis,
  AnalysisSettingsEntity,
  AnalysisSettings,
  UpdateAnalysisSettings,
} from './analysis.entity';

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
            'Analyze this security camera frame. Describe what is happening in the scene, including any notable activities, objects, or potential concerns. Be concise but thorough.',
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
      prompt: s?.prompt ?? '',
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
    const prompt =
      this._settings?.prompt ??
      'Analyze this security camera frame. Describe what is happening in the scene.';

    console.log(
      `🔬 Analyzing ${params.label} detection (${params.snapshotFilename}) with ${model}...`
    );

    const startTime = Date.now();

    try {
      const response = await fetch(`${this._ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: prompt,
              images: [base64Image],
            },
          ],
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 512,
          },
        }),
        signal: AbortSignal.timeout(120_000), // 2 minute timeout for inference
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(
          `Ollama API error (${response.status}): ${body.slice(0, 200)}`
        );
        return;
      }

      const result = (await response.json()) as {
        message?: { content?: string };
      };
      const description = result.message?.content?.trim();

      if (!description) {
        console.warn('Ollama returned empty analysis');
        return;
      }

      const durationMs = Date.now() - startTime;

      // Store the analysis result
      const analysis = this._repository.create({
        detectionEventId: params.detectionEventId,
        label: params.label,
        model,
        description,
        durationMs,
        snapshotFilename: params.snapshotFilename,
      });

      const saved = await this._repository.save(analysis);

      // Emit via WebSocket for real-time UI updates
      this._wsService.emitSceneAnalysis({
        id: saved.id,
        timestamp: saved.timestamp,
        detectionEventId: saved.detectionEventId,
        label: saved.label,
        model: saved.model,
        description: saved.description,
        durationMs: saved.durationMs,
        snapshotFilename: saved.snapshotFilename,
      });

      console.log(
        `🔬 Analysis complete for ${
          params.label
        } in ${durationMs}ms: "${description.slice(0, 80)}..."`
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
