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
import { ENTITIES } from '../data-source';
import { User } from '../users/user';

@Entity('plaid_category')
@Index(['user', 'name'], { unique: true })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('text', { nullable: true })
  color?: string;

  @Column('text', { nullable: true })
  icon?: string;

  // If this category maps to a Plaid category
  @Column('text', { nullable: true })
  plaidCategoryMapping?: string;

  // Sort order for display
  @Column('integer', { default: 0 })
  sortOrder!: number;

  // Is this a system-created category (from Plaid)?
  @Column('boolean', { default: false })
  isSystem!: boolean;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

// Zod schemas
export const CategoryInSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  plaidCategoryMapping: z.string().optional(),
  sortOrder: z.number().optional(),
});

export type CategoryIn = z.infer<typeof CategoryInSchema>;

export const CategoryOutSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  plaidCategoryMapping: z.string().nullable(),
  sortOrder: z.number(),
  isSystem: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CategoryOut = z.infer<typeof CategoryOutSchema>;

provide(ENTITIES, Category);
