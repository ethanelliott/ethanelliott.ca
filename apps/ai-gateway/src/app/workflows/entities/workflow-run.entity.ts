import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkflowEntity } from './workflow.entity';
import { RunStatus, RunTrigger } from '../workflow.types';

@Entity('workflow_runs')
export class WorkflowRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  workflowId!: string;

  @ManyToOne(() => WorkflowEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflowId' })
  workflow?: WorkflowEntity;

  @Index()
  @Column({ type: 'text' })
  status!: RunStatus;

  @Column({ type: 'text' })
  trigger!: RunTrigger;

  /** Payload the run was started with */
  @Column({ type: 'jsonb', nullable: true })
  input!: unknown | null;

  /** Outputs of every executed node, keyed by node id */
  @Column({ type: 'jsonb', nullable: true })
  output!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
