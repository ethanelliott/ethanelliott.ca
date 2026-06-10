import { provide } from '@ee/di';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';

/**
 * Single-row table that persists user-configurable recording settings
 * across backend restarts. Env vars provide the initial defaults only.
 */
@Entity('recording_settings')
export class RecordingSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Whether continuous video recording is enabled */
  @Column('boolean', { default: true })
  enabled!: boolean;

  /** How many days of video to keep before purging */
  @Column('integer', { default: 3 })
  retentionDays!: number;

  /** Target duration of each recording segment in seconds */
  @Column('integer', { default: 10 })
  segmentSeconds!: number;
}

// ── Zod Schemas ──

export const RecordingSettingsSchema = z.object({
  enabled: z.boolean(),
  retentionDays: z.number().int().min(1).max(30),
  segmentSeconds: z.number().int().min(2).max(60),
});

export type RecordingSettings = z.infer<typeof RecordingSettingsSchema>;

export const UpdateRecordingSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(30).optional(),
  segmentSeconds: z.number().int().min(2).max(60).optional(),
});

export type UpdateRecordingSettings = z.infer<
  typeof UpdateRecordingSettingsSchema
>;

provide(ENTITIES, RecordingSettingsEntity);
