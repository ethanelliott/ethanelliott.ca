import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../../data-source';
import { User } from '../../users/user';
import { Account, SimpleAccountSchema } from '../accounts/account';
import { Category, SimpleCategorySchema } from '../categories/category';
import { SimpleTagSchema, Tag } from '../tags/tag';

export const enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

@Entity()
@Index(['userId', 'date', 'type'])
@Index(['userId', 'account', 'date'])
@Index(['userId', 'category', 'date'])
@Index(['date', 'type'])
@Index(['category', 'date'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  type!: TransactionType;

  @ManyToOne(() => Account, (account) => account.id)
  account!: Account;

  @Column('date')
  date!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @ManyToOne(() => Category, (category) => category.name)
  category!: Category;

  @ManyToMany(() => Tag, (tag) => tag.name)
  @JoinTable()
  tags!: Array<Tag>;

  @Column('text')
  description!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

export const TransactionInSchema = z.object({
  type: z.enum([TransactionType.INCOME, TransactionType.EXPENSE]),
  account: SimpleAccountSchema,
  date: z.string().date(),
  amount: z.number().positive(),
  category: SimpleCategorySchema,
  tags: z.array(SimpleTagSchema),
  description: z.string().min(1),
});

export type TransactionIn = z.infer<typeof TransactionInSchema>;

export const TransactionOutSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum([TransactionType.INCOME, TransactionType.EXPENSE]),
  account: z.object({
    id: z.string().uuid(),
    name: z.string(),
    accountType: z.string(),
  }),
  date: z.string().date(),
  amount: z.number().positive(),
  category: z.string(),
  tags: z.array(z.string()),
  description: z.string().min(1),
  timestamp: z.date(),
  updatedAt: z.date(),
});

export type TransactionOut = z.infer<typeof TransactionOutSchema>;

provide(ENTITIES, Transaction);
