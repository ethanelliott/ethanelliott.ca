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
});

export type DetectionEventOut = z.infer<typeof DetectionEventOutSchema>;

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
});

export type DetectionSettings = z.infer<typeof DetectionSettingsSchema>;

export const UpdateDetectionSettingsSchema = z.object({
  enabledLabels: z.array(z.string()),
});

export type UpdateDetectionSettings = z.infer<
  typeof UpdateDetectionSettingsSchema
>;

provide(ENTITIES, DetectionEvent);
