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
import { PlaidItem } from './plaid-item.entity';

export enum AccountType {
  DEPOSITORY = 'depository',
  CREDIT = 'credit',
  LOAN = 'loan',
  INVESTMENT = 'investment',
  BROKERAGE = 'brokerage',
  OTHER = 'other',
}

export enum AccountSubtype {
  // Depository
  CHECKING = 'checking',
  SAVINGS = 'savings',
  HSA = 'hsa',
  CD = 'cd',
  MONEY_MARKET = 'money market',
  PAYPAL = 'paypal',
  PREPAID = 'prepaid',
  CASH_MANAGEMENT = 'cash management',
  EBT = 'ebt',
  // Credit
  CREDIT_CARD = 'credit card',
  // Loan
  AUTO = 'auto',
  BUSINESS = 'business',
  COMMERCIAL = 'commercial',
  CONSTRUCTION = 'construction',
  CONSUMER = 'consumer',
  HOME_EQUITY = 'home equity',
  LINE_OF_CREDIT = 'line of credit',
  LOAN = 'loan',
  MORTGAGE = 'mortgage',
  OVERDRAFT = 'overdraft',
  STUDENT = 'student',
  // Investment
  BROKERAGE = 'brokerage',
  IRA = 'ira',
  RETIREMENT = 'retirement',
  ROTH = 'roth',
  UGMA = 'ugma',
  // Other
  OTHER = 'other',
}

@Entity('plaid_account')
@Index(['user', 'plaidAccountId'], { unique: true })
@Index(['plaidItem'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Plaid's account ID (unique per item)
  @Column('text')
  plaidAccountId!: string;

  // Link to the Plaid item (bank connection)
  @ManyToOne(() => PlaidItem, { onDelete: 'CASCADE' })
  plaidItem!: PlaidItem;

  // Account details from Plaid
  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  officialName?: string;

  @Column('text')
  type!: AccountType;

  @Column('text', { nullable: true })
  subtype?: string;

  // Last 4 digits of account number
  @Column('text', { nullable: true })
  mask?: string;

  // Balance information (updated on sync)
  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  currentBalance?: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  availableBalance?: number;

  @Column('decimal', { precision: 12, scale: 2, nullable: true })
  limitAmount?: number;

  @Column('text', { default: 'CAD' })
  isoCurrencyCode!: string;

  @Column('datetime', { nullable: true })
  lastBalanceUpdate?: Date;

  // For hiding accounts the user doesn't want to track
  @Column('boolean', { default: true })
  isVisible!: boolean;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

// Zod schemas
export const AccountOutSchema = z.object({
  id: z.string().uuid(),
  plaidAccountId: z.string(),
  plaidItemId: z.string().uuid(),
  institutionName: z.string().nullable(),
  institutionLogo: z.string().nullable(),
  institutionColor: z.string().nullable(),
  name: z.string(),
  officialName: z.string().nullable(),
  type: z.nativeEnum(AccountType),
  subtype: z.string().nullable(),
  mask: z.string().nullable(),
  currentBalance: z.number().nullable(),
  availableBalance: z.number().nullable(),
  limitAmount: z.number().nullable(),
  isoCurrencyCode: z.string(),
  lastBalanceUpdate: z.date().nullable(),
  isVisible: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AccountOut = z.infer<typeof AccountOutSchema>;

export const AccountUpdateSchema = z.object({
  isVisible: z.boolean().optional(),
});

export type AccountUpdate = z.infer<typeof AccountUpdateSchema>;

provide(ENTITIES, Account);
