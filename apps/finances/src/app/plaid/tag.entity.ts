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

@Entity('plaid_tag')
@Index(['user', 'name'], { unique: true })
export class Tag {
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

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

// Zod schemas
export const TagInSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().optional(),
});

export type TagIn = z.infer<typeof TagInSchema>;

export const TagOutSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TagOut = z.infer<typeof TagOutSchema>;

provide(ENTITIES, Tag);
