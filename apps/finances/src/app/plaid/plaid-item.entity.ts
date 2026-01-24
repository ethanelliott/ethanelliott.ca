import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';
import { User } from '../users/user';

export enum PlaidItemStatus {
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR',
  PENDING_EXPIRATION = 'PENDING_EXPIRATION',
  REVOKED = 'REVOKED',
}

@Entity()
@Index(['user', 'itemId'], { unique: true })
export class PlaidItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Plaid's item ID
  @Column('text', { unique: true })
  itemId!: string;

  // Encrypted access token for API calls
  @Column('text')
  accessToken!: string;

  // Institution information
  @Column('text', { nullable: true })
  institutionId?: string;

  @Column('text', { nullable: true })
  institutionName?: string;

  @Column('text', { nullable: true })
  institutionLogo?: string;

  @Column('text', { nullable: true })
  institutionColor?: string;

  // Sync state
  @Column('text', { default: PlaidItemStatus.ACTIVE })
  status!: PlaidItemStatus;

  @Column('datetime', { nullable: true })
  lastSyncAt?: Date;

  @Column('text', { nullable: true })
  lastSyncCursor?: string;

  @Column('text', { nullable: true })
  lastError?: string;

  @Column('datetime', { nullable: true })
  consentExpiresAt?: Date;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user!: User;
}

// Zod schemas
export const PlaidItemOutSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string(),
  institutionId: z.string().nullable(),
  institutionName: z.string().nullable(),
  institutionLogo: z.string().nullable(),
  institutionColor: z.string().nullable(),
  status: z.nativeEnum(PlaidItemStatus),
  lastSyncAt: z.date().nullable(),
  lastError: z.string().nullable(),
  consentExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PlaidItemOut = z.infer<typeof PlaidItemOutSchema>;

provide(ENTITIES, PlaidItem);
