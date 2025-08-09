import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../../data-source';

// Entity for storing user's passkey credentials
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

  @Column('text')
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

  @Column('text')
  userId!: string;

  @Column('datetime')
  expiresAt!: Date;

  @Column('text', { nullable: true })
  deviceInfo?: string;

  @Column('boolean', { default: false })
  revoked!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity()
@Index(['username'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column('text')
  name!: string;

  @Column('text', { unique: true })
  username!: string;

  // Optional password hash - passkeys are preferred!
  @Column('text', { nullable: true })
  passwordHash?: string;

  // WebAuthn user handle (should be unique and persistent)
  @Column('text', { unique: true })
  webAuthnUserId!: string;

  @Column('boolean', { default: true })
  isActive!: boolean;

  @Column('boolean', { default: false })
  emailVerified!: boolean;

  @Column('boolean', { default: false })
  requireMFA!: boolean;

  @Column('datetime', { nullable: true })
  lastLoginAt?: Date;

  @Column('text', { nullable: true })
  lastLoginIP?: string;

  @Column('integer', { default: 0 })
  failedLoginAttempts!: number;

  @Column('datetime', { nullable: true })
  lockedUntil?: Date;

  // Relations
  @OneToMany(() => UserCredential, 'userId')
  credentials!: UserCredential[];

  @OneToMany(() => RefreshToken, 'userId')
  refreshTokens!: RefreshToken[];
}

// Zod schemas for validation
export const UserCredentialSchema = z.object({
  id: z.string().uuid(),
  credentialId: z.string(),
  publicKey: z.string(),
  counter: z.number(),
  userId: z.string().uuid(),
  deviceType: z.string().optional(),
  backedUp: z.boolean(),
  transports: z.string().optional(),
  createdAt: z.date(),
  lastUsed: z.date(),
});

export const RefreshTokenSchema = z.object({
  id: z.string().uuid(),
  token: z.string(),
  userId: z.string().uuid(),
  expiresAt: z.date(),
  deviceInfo: z.string().optional(),
  revoked: z.boolean(),
  createdAt: z.date(),
});

export const UserRegistrationSchema = z.object({
  name: z.string().min(1).max(100),
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).optional(),
});

export const UserLoginSchema = z.object({
  username: z.string(),
  password: z.string().optional(),
});

export const FullUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  username: z.string(),
  email: z.string().email(),
  isActive: z.boolean(),
  requireMFA: z.boolean(),
  lastLoginAt: z.date().nullable(),
  timestamp: z.date(),
  updatedAt: z.date(),
});

export const SafeUserSchema = FullUserSchema.omit({
  // Never expose sensitive fields
});

export const UserWithCredentialsSchema = FullUserSchema.extend({
  credentials: z.array(UserCredentialSchema),
  hasPassword: z.boolean(),
});

export type UserCredentialType = z.infer<typeof UserCredentialSchema>;
export type RefreshTokenType = z.infer<typeof RefreshTokenSchema>;
export type UserRegistration = z.infer<typeof UserRegistrationSchema>;
export type UserLogin = z.infer<typeof UserLoginSchema>;
export type FullUser = z.infer<typeof FullUserSchema>;
export type SafeUser = z.infer<typeof SafeUserSchema>;
export type UserWithCredentials = z.infer<typeof UserWithCredentialsSchema>;

// Register entities with TypeORM
provide(ENTITIES, User);
provide(ENTITIES, UserCredential);
provide(ENTITIES, RefreshToken);
