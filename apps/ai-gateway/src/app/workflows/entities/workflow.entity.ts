import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { WorkflowGraph, WorkflowSettings } from '../workflow.types';

@Entity('workflows')
export class WorkflowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** The full node/edge graph (includes editor positions) */
  @Column({ type: 'jsonb' })
  graph!: WorkflowGraph;

  @Column({ type: 'jsonb', default: {} })
  settings!: WorkflowSettings;

  /** Disabled workflows cannot be run */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /** Cron expression for scheduled execution (5-field, UTC) */
  @Column({ type: 'text', nullable: true })
  cron!: string | null;

  /**
   * Next scheduled firing time. Doubles as the multi-replica claim: the
   * scheduler atomically advances it (UPDATE … WHERE nextRunAt = <seen>)
   * and only the replica whose update lands starts the run.
   */
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  nextRunAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
