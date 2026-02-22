import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';

/**
 * Persists notification settings (single-row table).
 * Controls when and how detection alerts are sent via ntfy.
 */
@Entity('notification_settings')
export class NotificationSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Whether push notifications are enabled globally */
  @Column('boolean', { default: false })
  enabled!: boolean;

  /** The ntfy server base URL (e.g. https://ntfy.elliott.haus) */
  @Column('text', { default: 'https://ntfy.sh' })
  serverUrl!: string;

  /** The ntfy topic to publish to */
  @Column('text', { default: 'camera-detections' })
  topic!: string;

  /** Optional auth token for the ntfy server */
  @Column('text', { nullable: true })
  authToken!: string | null;

  /** Cooldown in seconds between notifications for the same label */
  @Column('integer', { default: 30 })
  cooldownSeconds!: number;

  /** Minimum confidence threshold to trigger a notification (0-1) */
  @Column('real', { default: 0.7 })
  minConfidence!: number;

  /** JSON array of labels that should trigger notifications (empty = all enabled) */
  @Column('simple-json', { default: '["person","car","dog","cat"]' })
  notifyLabels!: string[];

  /** Whether to attach the snapshot image to the notification */
  @Column('boolean', { default: true })
  attachSnapshot!: boolean;
}

// ── Zod Schemas ──

export const NotificationSettingsSchema = z.object({
  enabled: z.boolean(),
  serverUrl: z.string().url(),
  topic: z.string().min(1).max(128),
  authToken: z.string().nullable(),
  cooldownSeconds: z.number().int().min(0).max(3600),
  minConfidence: z.number().min(0).max(1),
  notifyLabels: z.array(z.string()),
  attachSnapshot: z.boolean(),
});

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const UpdateNotificationSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  serverUrl: z.string().url().optional(),
  topic: z.string().min(1).max(128).optional(),
  authToken: z.string().nullable().optional(),
  cooldownSeconds: z.number().int().min(0).max(3600).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  notifyLabels: z.array(z.string()).optional(),
  attachSnapshot: z.boolean().optional(),
});

export type UpdateNotificationSettings = z.infer<
  typeof UpdateNotificationSettingsSchema
>;

export const NotificationTestResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

provide(ENTITIES, NotificationSettingsEntity);
