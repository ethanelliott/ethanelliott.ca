import { provide } from '@ee/di';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';
import { TaskState, TaskStateSchema } from './task.entity';

@Entity('state_history')
@Index(['taskId', 'timestamp'])
export class StateHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  taskId!: string;

  @Column({ type: 'text', enum: TaskState, nullable: true })
  fromState?: TaskState;

  @Column({ type: 'text', enum: TaskState })
  toState!: TaskState;

  @Column('datetime')
  timestamp!: Date;
}

export const StateHistoryOutSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  fromState: TaskStateSchema.nullable(),
  toState: TaskStateSchema,
  timestamp: z.date(),
});
export type StateHistoryOut = z.infer<typeof StateHistoryOutSchema>;

provide(ENTITIES, StateHistory);
