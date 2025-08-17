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
import { FullUserSchema, User } from '../../users/user';
import { Account, SimpleAccountSchema } from '../accounts/account';
import { Category, SimpleCategorySchema } from '../categories/category';

@Entity()
@Index(['user', 'date'])
@Index(['fromAccount', 'date'])
@Index(['toAccount', 'date'])
@Index(['transferType', 'date'])
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  transferType!: string;

  @ManyToOne(() => Account, (account) => account.id)
  fromAccount!: Account;

  @ManyToOne(() => Account, (account) => account.id)
  toAccount!: Account;

  @Column('date')
  date!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @ManyToOne(() => Category, (category) => category.name, { nullable: true })
  category?: Category;

  @Column('text')
  description!: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

// Zod schemas
export const TransferInSchema = z.object({
  transferType: z.string(),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  date: z.string().date(),
  amount: z.number().positive(),
  description: z.string().min(1),
});

export type TransferIn = z.infer<typeof TransferInSchema>;

export const TransferOutSchema = z.object({
  id: z.string().uuid(),
  transferType: z.string(),
  date: z.string().date(),
  amount: z.number().positive(),
  description: z.string().min(1),
  timestamp: z.date(),
  updatedAt: z.date(),
  fromAccount: z.object({
    id: z.string().uuid(),
    name: z.string(),
    accountType: z.string(),
  }),
  toAccount: z.object({
    id: z.string().uuid(),
    name: z.string(),
    accountType: z.string(),
  }),
  category: z.string().optional(),
});

export type TransferOut = z.infer<typeof TransferOutSchema>;

provide(ENTITIES, Transfer);
