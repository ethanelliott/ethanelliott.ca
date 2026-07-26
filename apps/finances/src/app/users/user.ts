import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { z } from 'zod';
import { ENTITIES } from '../data-source';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: User;
  }
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

  @Column('text', { unique: true })
  webAuthnUserId!: string;

  @Column('boolean', { default: true })
  isActive!: boolean;

  @Column('datetime', { nullable: true })
  lastLoginAt?: Date;

  @Column('text', { nullable: true })
  lastLoginIP?: string;

  @Column('integer', { default: 0 })
  failedLoginAttempts!: number;

  @Column('datetime', { nullable: true })
  lockedUntil?: Date;

  @OneToMany(() => UserCredential, (cred) => cred.user)
  credentials!: UserCredential[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens!: RefreshToken[];
}

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

  // The FK is exposed as a plain column so lookups always have the value.
  // (It used to be a relation property typed as string: findOneBy never
  // loaded it, so login resolved `{ id: undefined }` — which TypeORM turns
  // into "any user" — and sessions were issued for the wrong account.)
  // The column keeps its historical name so existing rows survive schema
  // synchronization.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userIdId' })
  user!: User;

  // Nullable to match the column the old relation created — declaring it
  // NOT NULL would make schema sync run SET NOT NULL on deploy, which fails
  // (and takes the app down) if any legacy row lacks the FK. Callers must
  // reject a missing userId instead; see the auth service lookups.
  @Column('uuid', { name: 'userIdId', nullable: true })
  userId?: string | null;

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

/**
 * Refresh tokens issued before this generation carried the wrong user id
 * (see the UserCredential.userId note) and must never be honoured again.
 * Legacy rows have a NULL generation (the column has no DB default on
 * purpose), so bumping this constant force-expires every outstanding
 * session and users re-authenticate with their passkey.
 */
export const REFRESH_TOKEN_GENERATION = 2;

// Entity for refresh tokens
@Entity()
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  token!: string;

  // Same FK-as-column shape (and historical column name) as UserCredential.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userIdId' })
  user!: User;

  // Nullable to match the column the old relation created — declaring it
  // NOT NULL would make schema sync run SET NOT NULL on deploy, which fails
  // (and takes the app down) if any legacy row lacks the FK. Callers must
  // reject a missing userId instead; see the auth service lookups.
  @Column('uuid', { name: 'userIdId', nullable: true })
  userId?: string | null;

  @Column('integer', { nullable: true })
  generation?: number | null;

  @Column('datetime')
  expiresAt!: Date;

  @Column('text', { nullable: true })
  deviceInfo?: string;

  @Column('boolean', { default: false })
  revoked!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
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
});

export const FullUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  username: z.string(),
  isActive: z.boolean(),
  lastLoginAt: z.date().nullable(),
  timestamp: z.date(),
  updatedAt: z.date(),
});

export const SafeUserSchema = FullUserSchema.omit({
  // Never expose sensitive fields
});

export const UserWithCredentialsSchema = FullUserSchema.extend({
  credentials: z.array(UserCredentialSchema),
});

export type UserCredentialType = z.infer<typeof UserCredentialSchema>;
export type RefreshTokenType = z.infer<typeof RefreshTokenSchema>;
export type UserRegistration = z.infer<typeof UserRegistrationSchema>;
export type FullUser = z.infer<typeof FullUserSchema>;
export type SafeUser = z.infer<typeof SafeUserSchema>;
export type UserWithCredentials = z.infer<typeof UserWithCredentialsSchema>;

// Register entities with TypeORM
provide(ENTITIES, User);
provide(ENTITIES, UserCredential);
provide(ENTITIES, RefreshToken);
