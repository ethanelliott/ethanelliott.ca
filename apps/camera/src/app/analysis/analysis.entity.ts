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
