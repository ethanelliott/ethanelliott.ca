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

  /**
   * Cron expression for scheduled execution. Stored now for schema
   * stability — the scheduler lands in a later phase and ignores it today.
   */
  @Column({ type: 'text', nullable: true })
  cron!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
