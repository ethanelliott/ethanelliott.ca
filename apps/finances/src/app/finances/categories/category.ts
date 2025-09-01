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

export const CategoryOutSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  updatedAt: z.date(),
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export type CategoryOut = z.infer<typeof CategoryOutSchema>;

export const CategoryDeletedSchema = z.object({
  message: z.string(),
});

export type CategoryDeleted = z.infer<typeof CategoryDeletedSchema>;

export const SimpleCategorySchema = z.string();

export type SimpleCategory = z.infer<typeof SimpleCategorySchema>;

provide(ENTITIES, Category);
