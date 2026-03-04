import { provide } from '@ee/di';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';

@Entity('task_dependency')
@Index(['taskId', 'dependsOnId'], { unique: true })
export class TaskDependency {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  taskId!: string;

  @Column('uuid')
  dependsOnId!: string;
}

export const TaskDependencyOutSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  dependsOnId: z.string().uuid(),
});
export type TaskDependencyOut = z.infer<typeof TaskDependencyOutSchema>;

provide(ENTITIES, TaskDependency);
