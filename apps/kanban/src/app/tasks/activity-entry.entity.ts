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

export enum ActivityEntryType {
  COMMENT = 'COMMENT',
  STATE_CHANGE = 'STATE_CHANGE',
  ASSIGNMENT = 'ASSIGNMENT',
  DEPENDENCY = 'DEPENDENCY',
  SUBTASK = 'SUBTASK',
}

@Entity('activity_entry')
@Index(['taskId', 'createdAt'])
export class ActivityEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  taskId!: string;

  @Column({ type: 'text', enum: ActivityEntryType })
  type!: ActivityEntryType;

  @Column('text', { nullable: true })
  author?: string;

  @Column('text')
  content!: string;

  @Column('text', { nullable: true })
  metadata?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

export const ActivityEntryTypeSchema = z.nativeEnum(ActivityEntryType);

export const ActivityEntryOutSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  type: ActivityEntryTypeSchema,
  author: z.string().nullable(),
  content: z.string(),
  metadata: z.any().nullable(),
  createdAt: z.date(),
});
export type ActivityEntryOut = z.infer<typeof ActivityEntryOutSchema>;

export const ActivityCommentInSchema = z.object({
  author: z.string().min(1),
  content: z.string().min(1),
});
export type ActivityCommentIn = z.infer<typeof ActivityCommentInSchema>;

provide(ENTITIES, ActivityEntry);
