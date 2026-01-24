import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';
import { User } from '../users/user';
import { PlaidItem } from './plaid-item.entity';

export enum SyncType {
  INITIAL = 'INITIAL',
  INCREMENTAL = 'INCREMENTAL',
  MANUAL = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
}

export enum SyncStatus {
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('sync_log')
@Index(['plaidItem', 'createdAt'])
@Index(['user', 'createdAt'])
export class SyncLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => PlaidItem, { onDelete: 'CASCADE' })
  plaidItem!: PlaidItem;

  @Column('text')
  syncType!: SyncType;

  @Column('text')
  status!: SyncStatus;

  @Column('integer', { default: 0 })
  transactionsAdded!: number;

  @Column('integer', { default: 0 })
  transactionsModified!: number;

  @Column('integer', { default: 0 })
  transactionsRemoved!: number;

  @Column('integer', { default: 0 })
  accountsUpdated!: number;

  @Column('text', { nullable: true })
  error?: string;

  @Column('integer', { nullable: true })
  durationMs?: number;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

// Zod schemas
export const SyncLogOutSchema = z.object({
  id: z.string().uuid(),
  plaidItemId: z.string().uuid(),
  institutionName: z.string().nullable(),
  syncType: z.nativeEnum(SyncType),
  status: z.nativeEnum(SyncStatus),
  transactionsAdded: z.number(),
  transactionsModified: z.number(),
  transactionsRemoved: z.number(),
  accountsUpdated: z.number(),
  error: z.string().nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.date(),
});

export type SyncLogOut = z.infer<typeof SyncLogOutSchema>;

provide(ENTITIES, SyncLog);
