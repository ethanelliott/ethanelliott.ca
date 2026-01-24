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
import { ENTITIES } from '../data-source';
import { User } from '../users/user';
import { Account } from './account.entity';
import { Category } from './category.entity';
import { Tag } from './tag.entity';

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
}

@Entity('plaid_transaction')
@Index(['user', 'plaidTransactionId'], { unique: true })
@Index(['user', 'date'])
@Index(['user', 'isReviewed'])
@Index(['account', 'date'])
@Index(['category', 'date'])
@Index(['linkedTransferId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Plaid's transaction ID (for deduplication)
  @Column('text', { unique: true })
  plaidTransactionId!: string;

  // Link to account
  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  account!: Account;

  // Transaction details from Plaid
  @Column('date')
  date!: string;

  @Column('datetime', { nullable: true })
  authorizedDate?: Date;

  // Amount: positive = money out (expense), negative = money in (income)
  // This matches Plaid's convention
  @Column('decimal', { precision: 12, scale: 2 })
  amount!: number;

  @Column('text')
  type!: TransactionType;

  // Merchant/description from Plaid
  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  merchantName?: string;

  // Plaid's category (stored for reference)
  @Column('text', { nullable: true })
  plaidCategory?: string;

  @Column('text', { nullable: true })
  plaidCategoryId?: string;

  @Column('text', { nullable: true })
  plaidPersonalFinanceCategory?: string;

  // User's assigned category (can override Plaid's)
  @ManyToOne(() => Category, { nullable: true })
  category?: Category;

  // User's tags
  @ManyToMany(() => Tag)
  @JoinTable()
  tags!: Tag[];

  // User's notes/description override
  @Column('text', { nullable: true })
  notes?: string;

  // Pending transactions may change
  @Column('boolean', { default: false })
  pending!: boolean;

  // Has the user reviewed/categorized this transaction?
  @Column('boolean', { default: false })
  isReviewed!: boolean;

  // For transfer detection - link to the other side of a transfer
  @Column('uuid', { nullable: true })
  linkedTransferId?: string;

  // Payment metadata
  @Column('text', { nullable: true })
  paymentChannel?: string;

  @Column('text', { nullable: true })
  transactionCode?: string;

  // Location data (if available)
  @Column('text', { nullable: true })
  locationCity?: string;

  @Column('text', { nullable: true })
  locationRegion?: string;

  @Column('text', { nullable: true })
  locationCountry?: string;

  @Column('text', { default: 'CAD' })
  isoCurrencyCode!: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

// Zod schemas
export const TransactionOutSchema = z.object({
  id: z.string().uuid(),
  plaidTransactionId: z.string(),
  accountId: z.string().uuid(),
  accountName: z.string(),
  institutionName: z.string().nullable(),
  date: z.string(),
  authorizedDate: z.date().nullable(),
  amount: z.number(),
  type: z.nativeEnum(TransactionType),
  name: z.string(),
  merchantName: z.string().nullable(),
  plaidCategory: z.string().nullable(),
  plaidPersonalFinanceCategory: z.string().nullable(),
  category: z.string().nullable(),
  categoryColor: z.string().nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  pending: z.boolean(),
  isReviewed: z.boolean(),
  linkedTransferId: z.string().uuid().nullable(),
  paymentChannel: z.string().nullable(),
  locationCity: z.string().nullable(),
  locationRegion: z.string().nullable(),
  isoCurrencyCode: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TransactionOut = z.infer<typeof TransactionOutSchema>;

export const TransactionUpdateSchema = z.object({
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  isReviewed: z.boolean().optional(),
});

export type TransactionUpdate = z.infer<typeof TransactionUpdateSchema>;

export const BulkReviewSchema = z.object({
  transactionIds: z.array(z.string().uuid()),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  isReviewed: z.boolean().optional(),
});

export type BulkReview = z.infer<typeof BulkReviewSchema>;

provide(ENTITIES, Transaction);
