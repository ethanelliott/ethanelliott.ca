import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: { id: string };
  }
}

// Entity for storing a user's passkey credentials
@Entity()
export class UserCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  credentialId!: string;

  @Column('text')
  publicKey!: string;

  @Column('integer')
  counter!: number;

  @ManyToOne(() => User, (c) => c.id)
  userId!: string;

  @Column('text', { nullable: true })
  deviceType?: string;

  @Column('boolean', { default: false })
  backedUp!: boolean;

  @Column('text', { nullable: true })
  transports?: string; // JSON string of transport methods

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  lastUsed!: Date;
}

// Entity for refresh tokens
@Entity()
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  token!: string;

  @ManyToOne(() => User, (c) => c.id)
  userId!: string;

  @Column('timestamp')
  expiresAt!: Date;

  @Column('text', { nullable: true })
  deviceInfo?: string;

  @Column('boolean', { default: false })
  revoked!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

/**
 * A Wheel account is intentionally anonymous: there is no username or email.
 * Each account is just a random id (the primary key) that a passkey is bound
 * to. An optional display name can be set later from the profile screen.
 */
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text', { default: 'Wheel user' })
  name!: string;

  @Column('text', { unique: true })
  webAuthnUserId!: string;

  @Column('boolean', { default: true })
  isActive!: boolean;

  @Column('timestamp', { nullable: true })
  lastLoginAt?: Date;

  @Column('integer', { default: 0 })
  failedLoginAttempts!: number;

  @Column('timestamp', { nullable: true })
  lockedUntil?: Date;

  @OneToMany(() => UserCredential, (cred) => cred.userId)
  credentials!: UserCredential[];

  @OneToMany(() => RefreshToken, (cred) => cred.userId)
  refreshTokens!: RefreshToken[];
}

// Zod schemas for validation

// Registration takes no input — accounts are anonymous. An optional display
// name may be provided to personalise the account up front.
export const UserRegistrationSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
  })
  .optional();

export const SafeUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  lastLoginAt: z.date().nullable(),
  timestamp: z.date(),
  updatedAt: z.date(),
});

export type UserRegistration = z.infer<typeof UserRegistrationSchema>;
export type SafeUser = z.infer<typeof SafeUserSchema>;

// Register entities with TypeORM
provide(ENTITIES, User);
provide(ENTITIES, UserCredential);
provide(ENTITIES, RefreshToken);
