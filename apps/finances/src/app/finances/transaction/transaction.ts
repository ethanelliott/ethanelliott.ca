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
import { Category, SimpleCategorySchema } from '../categories/category';
import { Medium, SimpleMediumSchema } from '../mediums/medium';
import { SimpleTagSchema, Tag } from '../tags/tag';

export const enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

@Entity()
@Index(['date', 'type'])
@Index(['category', 'date'])
@Index(['medium', 'date'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  type!: TransactionType;

  @ManyToOne(() => Medium, (medium) => medium.name)
  medium!: Medium;

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
}

export const TransactionInSchema = z.object({
  type: z.enum([TransactionType.INCOME, TransactionType.EXPENSE]),
  medium: SimpleMediumSchema,
  date: z.string().date(),
  amount: z.number(),
  category: SimpleCategorySchema,
  tags: z.array(SimpleTagSchema),
  description: z.string(),
});

export type TransactionIn = z.infer<typeof TransactionInSchema>;

export const TransactionOutSchema = TransactionInSchema.extend({
  id: z.string().uuid(),
  timestamp: z.date(),
  updatedAt: z.date(),
});

export type TransactionOut = z.infer<typeof TransactionOutSchema>;

provide(ENTITIES, Transaction);
