import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../../data-source';
import { User } from '../../users/user';

@Entity()
@Index(['user', 'name'], { unique: true })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('text', { nullable: true })
  color?: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

export const FullCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().optional(),
});

export type FullCategory = z.infer<typeof FullCategorySchema>;

export const CategoryOutSchema = FullCategorySchema.extend({
  id: z.string().uuid(),
  timestamp: z.date(),
  updatedAt: z.date(),
});

export type CategoryOut = z.infer<typeof CategoryOutSchema>;

export const SimpleCategorySchema = z.string();

export type SimpleCategory = z.infer<typeof SimpleCategorySchema>;

provide(ENTITIES, Category);
