import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';

@Entity('category')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text', { unique: true })
  name!: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('text', { nullable: true })
  color?: string;

  @Column('text', { nullable: true })
  icon?: string;
}

// Zod schemas
export const CategoryInSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export type CategoryIn = z.infer<typeof CategoryInSchema>;

export const CategoryOutSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CategoryOut = z.infer<typeof CategoryOutSchema>;

provide(ENTITIES, Category);
