import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';
import {
  LIGHTING_CONDITIONS,
  NOTIFY_TRIGGERS,
  SCENE_ACTIVITIES,
  THREAT_LEVELS,
  VISIBILITY_LEVELS,
} from './taxonomy';
import type {
  LightingCondition,
  NotifyTrigger,
  SceneActivity,
  ThreatLevel,
  VisibilityLevel,
} from './taxonomy';

export type SceneEntityType = 'person' | 'vehicle' | 'animal' | 'object';
export type AnomalyRating = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SceneEntity {
  type: SceneEntityType;
  description: string;
  location: string;
  activity: string;
  anomaly_score: number;
  anomaly_reason: string | null;
}

/**
 * Stores scene analysis results from the Ollama vision model.
 * Each row is linked to a detection event via its detectionEventId.
 */
@Entity('scene_analysis')
export class SceneAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  @Index()
  timestamp!: Date;

  /** The detection event ID that triggered this analysis */
  @Column('text')
  @Index()
  detectionEventId!: string;

  /** The label that triggered the analysis (e.g. "person", "car") */
  @Column('text')
  label!: string;

  /** The model used for analysis */
  @Column('text')
  model!: string;

  /** One-sentence summary of the scene (maps to summary field in structured output) */
  @Column('text')
  description!: string;

  /** 0–10 overall anomaly score from the vision model */
  @Column('integer', { nullable: true })
  overallScore!: number | null;

  /** LOW / MEDIUM / HIGH rating from the vision model */
  @Column('text', { nullable: true })
  overallRating!: AnomalyRating | null;

  /** Structured list of notable entities detected in the frame */
  @Column('simple-json', { nullable: true })
  entities!: SceneEntity[] | null;

  /** How long the analysis took in milliseconds */
  @Column('integer', { default: 0 })
  durationMs!: number;

  /** The snapshot filename that was analysed */
  @Column('text', { nullable: true })
  snapshotFilename!: string | null;

  // ── Classification ──
  //
  // Nullable throughout: rows written before the taxonomy existed keep their
  // legacy score and rating, and the read path fills these in from those.

  /** What is happening in the frame */
  @Column('text', { nullable: true })
  @Index()
  activity!: SceneActivity | null;

  /** How much attention the frame deserves */
  @Column('text', { nullable: true })
  @Index()
  threat!: ThreatLevel | null;

  /** Notification conditions the model found to be met */
  @Column('simple-json', { nullable: true })
  triggers!: NotifyTrigger[] | null;

  /** Whether the model thinks this is worth a push notification */
  @Column('boolean', { nullable: true })
  notifyRecommended!: boolean | null;

  /** Why, in one clause — shown as the notification body */
  @Column('text', { nullable: true })
  notifyReason!: string | null;

  @Column('text', { nullable: true })
  lighting!: LightingCondition | null;

  /** Whether the frame is good enough to trust the rest of this row */
  @Column('text', { nullable: true })
  visibility!: VisibilityLevel | null;

  /** True when a notification was actually dispatched for this analysis */
  @Column('boolean', { default: false })
  notified!: boolean;
}

/**
 * Single-row table that persists scene analysis settings.
 */
@Entity('analysis_settings')
export class AnalysisSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Whether scene analysis is enabled */
  @Column('boolean', { default: true })
  enabled!: boolean;

  /** The Ollama model to use for vision analysis */
  @Column('text', { default: 'qwen3-vl:4b' })
  model!: string;

  /** Baseline context injected into the anomaly detection prompt */
  @Column('text', {
    default:
      'Parked cars, SUVs, trucks in the lot. Residential apartment buildings, trees, grass, sidewalks. Normal ambient lighting.',
  })
  prompt!: string;

  /** Cooldown in seconds between analyses for the same label (prevents spam) */
  @Column('integer', { default: 30 })
  cooldownSeconds!: number;

  /** Labels that should trigger scene analysis (empty = all detected labels) */
  @Column('simple-json', { default: '["person","car","dog","cat"]' })
  analyzeLabels!: string[];

  /** Minimum detection confidence to trigger analysis */
  @Column('real', { default: 0.7 })
  minConfidence!: number;
}

// ── Zod Schemas ──

const SceneEntitySchema = z.object({
  type: z.enum(['person', 'vehicle', 'animal', 'object']),
  description: z.string(),
  location: z.string(),
  activity: z.string(),
  anomaly_score: z.number().int().min(0).max(10),
  anomaly_reason: z.string().nullable(),
});

export const SceneAnalysisOutSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  detectionEventId: z.string(),
  label: z.string(),
  model: z.string(),
  description: z.string(),
  overallScore: z.number().int().min(0).max(10).nullable(),
  overallRating: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable(),
  entities: z.array(SceneEntitySchema).nullable(),
  durationMs: z.number(),
  snapshotFilename: z.string().nullable(),
  activity: z.enum(SCENE_ACTIVITIES).nullable(),
  threat: z.enum(THREAT_LEVELS).nullable(),
  triggers: z.array(z.enum(NOTIFY_TRIGGERS)).nullable(),
  notifyRecommended: z.boolean().nullable(),
  notifyReason: z.string().nullable(),
  lighting: z.enum(LIGHTING_CONDITIONS).nullable(),
  visibility: z.enum(VISIBILITY_LEVELS).nullable(),
  notified: z.boolean(),
});

export type SceneAnalysisOut = z.infer<typeof SceneAnalysisOutSchema>;

export const AnalysisSettingsSchema = z.object({
  enabled: z.boolean(),
  model: z.string(),
  prompt: z.string(),
  cooldownSeconds: z.number().int().min(0).max(3600),
  analyzeLabels: z.array(z.string()),
  minConfidence: z.number().min(0).max(1),
});

export type AnalysisSettings = z.infer<typeof AnalysisSettingsSchema>;

export const UpdateAnalysisSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  cooldownSeconds: z.number().int().min(0).max(3600).optional(),
  analyzeLabels: z.array(z.string()).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
});

export type UpdateAnalysisSettings = z.infer<
  typeof UpdateAnalysisSettingsSchema
>;

provide(ENTITIES, SceneAnalysis);
provide(ENTITIES, AnalysisSettingsEntity);
