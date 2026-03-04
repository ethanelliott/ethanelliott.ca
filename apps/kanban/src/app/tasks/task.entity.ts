import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';

export enum TaskState {
  BACKLOG = 'BACKLOG',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
}

export enum TaskPriority {
  DEFAULT = 100,
}

@Entity('task')
@Index(['project', 'state', 'priority', 'createdAt'])
@Index(['project', 'assignee', 'state'])
@Index(['parentId', 'deletedAt'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  title!: string;

  @Column('text')
  description!: string;

  @Column({
    type: 'text',
    enum: TaskState,
    default: TaskState.BACKLOG,
  })
  state!: TaskState;

  @Column('integer', { default: 100 })
  priority!: number;

  @Column('text')
  project!: string;

  @Column('text', { nullable: true })
  assignee?: string;

  @Column('datetime', { nullable: true })
  assignedAt?: Date;

  @Column('uuid', { nullable: true })
  parentId?: string;

  // Self-referential ManyToOne — only loaded when explicitly requested
  @ManyToOne(() => Task, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parentId' })
  parent?: Task;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}

// ---------- Zod schemas ----------

export const TaskStateSchema = z.nativeEnum(TaskState);

export const TaskInSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  priority: z.number().int().default(100),
  project: z.string().min(1),
  state: TaskStateSchema.optional().default(TaskState.BACKLOG),
  parentId: z.string().uuid().optional(),
});
export type TaskIn = z.infer<typeof TaskInSchema>;

export const TaskPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).optional(),
  priority: z.number().int().optional(),
  parentId: z.string().uuid().nullable().optional(),
});
export type TaskPatch = z.infer<typeof TaskPatchSchema>;

export const TaskOutSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  state: TaskStateSchema,
  priority: z.number(),
  project: z.string(),
  assignee: z.string().nullable(),
  assignedAt: z.date().nullable(),
  parentId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  depCount: z.number().int().default(0),
  subtaskCount: z.number().int().default(0),
});
export type TaskOut = z.infer<typeof TaskOutSchema>;

provide(ENTITIES, Task);
