import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ENTITIES } from '../data-source';
import type { EpisodeContext } from '../detection/tracker';

export type QueueState = 'pending' | 'failed';

/**
 * Work waiting for the vision model.
 *
 * Analysis used to be fire-and-forget behind a per-label cooldown, which
 * meant load was shed by silently dropping events — including ones nobody
 * would have chosen to drop. Persisting the queue makes the guarantee the
 * other way round: work survives a restart, retries on failure, and is only
 * ever discarded deliberately and with a reason.
 */
@Entity('analysis_queue')
export class AnalysisQueueItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  @Index()
  createdAt!: Date;

  @Column('text')
  @Index()
  detectionEventId!: string;

  @Column('text')
  label!: string;

  @Column('text', { nullable: true })
  snapshotFilename!: string | null;

  /** When the subject was first seen — what an alert links back to */
  @Column('datetime', { nullable: true })
  observedAt!: Date | null;

  /** Best detector confidence for the subject, for the analysis threshold */
  @Column('real', { nullable: true })
  confidence!: number | null;

  /** Higher runs first; a person outranks a cat, an early pass a late one. */
  @Column('integer', { default: 0 })
  @Index()
  priority!: number;

  /** What the tracker observed, handed to the model with the frame. */
  @Column('simple-json', { nullable: true })
  context!: EpisodeContext | null;

  @Column('text', { default: 'pending' })
  @Index()
  state!: QueueState;

  @Column('integer', { default: 0 })
  attempts!: number;

  /** Retry backoff; the worker ignores rows until this passes. */
  @Column('datetime', { nullable: true })
  nextAttemptAt!: Date | null;

  @Column('text', { nullable: true })
  lastError!: string | null;
}

provide(ENTITIES, AnalysisQueueItem);
