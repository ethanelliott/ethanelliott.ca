import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkflowRunEntity } from './workflow-run.entity';
import { StepStatus } from '../workflow.types';

/**
 * One executed node within a run. This is the autopsy table: every step
 * stores its rendered input and raw output so failed scheduled runs can be
 * debugged after the fact.
 */
@Entity('workflow_step_runs')
export class WorkflowStepRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  runId!: string;

  @ManyToOne(() => WorkflowRunEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run?: WorkflowRunEntity;

  /** Node id within the workflow graph */
  @Column({ type: 'text' })
  nodeId!: string;

  /** Step kind (e.g. tool_call, llm_prompt) */
  @Column({ type: 'text' })
  kind!: string;

  @Column({ type: 'text' })
  status!: StepStatus;

  /** Execution order within the run (1-based) */
  @Column({ type: 'int' })
  sequence!: number;

  /** Rendered node config the executor actually received */
  @Column({ type: 'jsonb', nullable: true })
  input!: unknown | null;

  @Column({ type: 'jsonb', nullable: true })
  output!: unknown | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  /** 1 + number of retries consumed */
  @Column({ type: 'int', default: 1 })
  attempts!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMs!: number | null;
}
