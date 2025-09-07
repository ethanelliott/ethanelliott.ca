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
export class Account {
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

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  initialBalance!: number;

  @Column('text', { nullable: true })
  currency?: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

// Zod schemas
export const AccountInSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  initialBalance: z.number().default(0),
  currency: z.string().default('CAD'),
});

export type AccountIn = z.infer<typeof AccountInSchema>;

export const AccountOutSchema = AccountInSchema.extend({
  id: z.string().uuid(),
  timestamp: z.date(),
  updatedAt: z.date(),
  currentBalance: z.number().optional(),
  totalIncome: z.number().optional(),
  totalExpenses: z.number().optional(),
  transfersIn: z.number().optional(),
  transfersOut: z.number().optional(),
});

export type AccountOut = z.infer<typeof AccountOutSchema>;

export const SimpleAccountSchema = z.string().uuid();

export type SimpleAccount = z.infer<typeof SimpleAccountSchema>;

provide(ENTITIES, Account);
