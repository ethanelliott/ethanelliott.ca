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
export class Tag {
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

export const FullTagSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export type FullTag = z.infer<typeof FullTagSchema>;

export const TagOutSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  timestamp: z.date(),
  updatedAt: z.date(),
});

export type TagOut = z.infer<typeof TagOutSchema>;

export const SimpleTagSchema = z.string();

export type SimpleTag = z.infer<typeof SimpleTagSchema>;

provide(ENTITIES, Tag);
