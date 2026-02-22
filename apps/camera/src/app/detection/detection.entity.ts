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

@Entity('detection_event')
export class DetectionEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  @Index()
  timestamp!: Date;

  @Column('text')
  label!: string;

  @Column('real')
  confidence!: number;

  @Column('text', { nullable: true })
  snapshotFilename!: string | null;

  @Column('simple-json')
  bbox!: { x: number; y: number; width: number; height: number };

  @Column('integer', { default: 0 })
  frameWidth!: number;

  @Column('integer', { default: 0 })
  frameHeight!: number;

  @Column('boolean', { default: false })
  pinned!: boolean;
}

// ── Zod Schemas ──

export const BboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const DetectionEventOutSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  label: z.string(),
  confidence: z.number(),
  snapshotFilename: z.string().nullable(),
  bbox: BboxSchema,
  frameWidth: z.number(),
  frameHeight: z.number(),
  pinned: z.boolean(),
});

export type DetectionEventOut = z.infer<typeof DetectionEventOutSchema>;

/** Lightweight detection data emitted per frame for the live overlay. */
export interface FrameDetection {
  id: string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
}

export const DetectionStatsSchema = z.object({
  totalEvents: z.number(),
  todayEvents: z.number(),
  topLabels: z.array(
    z.object({
      label: z.string(),
      count: z.number(),
    })
  ),
  averageConfidence: z.number(),
});

export type DetectionStats = z.infer<typeof DetectionStatsSchema>;

export const DetectionSettingsSchema = z.object({
  availableLabels: z.array(z.string()),
  enabledLabels: z.array(z.string()),
  retentionDays: z.number().int().min(1).max(365),
});

export type DetectionSettings = z.infer<typeof DetectionSettingsSchema>;

export const UpdateDetectionSettingsSchema = z.object({
  enabledLabels: z.array(z.string()).optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
});

export type UpdateDetectionSettings = z.infer<
  typeof UpdateDetectionSettingsSchema
>;

/**
 * Single-row table that persists user-configurable detection settings
 * across backend restarts.
 */
@Entity('detection_settings')
export class DetectionSettingsEntity {
  /** Always 'singleton' — ensures only one row exists. */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** JSON array of enabled COCO-SSD label strings */
  @Column('simple-json')
  enabledLabels!: string[];

  /** How many days to keep detection events before purging */
  @Column('integer', { default: 7 })
  retentionDays!: number;
}

provide(ENTITIES, DetectionEvent);
provide(ENTITIES, DetectionSettingsEntity);
