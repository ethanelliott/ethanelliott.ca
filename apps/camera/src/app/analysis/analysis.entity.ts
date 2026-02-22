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

  /** The scene description returned by the vision model */
  @Column('text')
  description!: string;

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

  /** The prompt sent to the vision model */
  @Column('text', {
    default:
      'Analyze this security camera frame. Describe what is happening in the scene, including any notable activities, objects, or potential concerns. Be concise but thorough.',
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

export const SceneAnalysisOutSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  detectionEventId: z.string(),
  label: z.string(),
  model: z.string(),
  description: z.string(),
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
