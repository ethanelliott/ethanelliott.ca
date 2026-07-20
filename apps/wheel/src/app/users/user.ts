import { provide } from '@ee/di';
import {
  Column,
  CreateDateColumn,
  Entity,
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

  // The FK is exposed as a plain column so lookups always have the value.
  // (It used to be a relation property typed as string: findOneBy never
  // loaded it, so login resolved `{ id: undefined }` — which TypeORM turns
  // into "first user in the table" — and sessions crossed accounts.)
  // The column keeps its historical name so existing rows survive
  // schema synchronization.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userIdId' })
  user!: User;

  @Column('uuid', { name: 'userIdId' })
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

  @Column('uuid', { name: 'userIdId' })
  userId!: string;

  @Column('integer', { nullable: true })
  generation?: number | null;

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
 * A Wheel account is identified by a random uuid (the primary key) that a
 * passkey is bound to — no email is ever stored. Every account also has a
 * unique, user-editable username so wheels can be shared between people.
 * The uuid backs uniqueness; the username is just a friendly, changeable
 * handle on top of it.
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

  // Unique handle used to find people when sharing wheels. Nullable so
  // accounts created before usernames existed keep working — they are
  // backfilled with a generated handle the next time their profile loads.
  @Column('text', { unique: true, nullable: true })
  username?: string | null;

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

  @OneToMany(() => UserCredential, (cred) => cred.user)
  credentials!: UserCredential[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens!: RefreshToken[];
}

// Zod schemas for validation

// Registration takes no credentials — a passkey is all that's required. An
// optional display name may be provided to personalise the account up front;
// a unique username is generated automatically and can be edited later.
export const UserRegistrationSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
  })
  .optional();

// 3-24 chars, letters/digits/underscore/hyphen, must start alphanumeric.
export const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,23}$/;

export const UsernameSchema = z
  .string()
  .regex(
    USERNAME_PATTERN,
    'Username must be 3-24 characters using letters, numbers, - or _'
  );

export const SafeUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  username: z.string().nullable(),
  isActive: z.boolean(),
  lastLoginAt: z.date().nullable(),
  timestamp: z.date(),
  updatedAt: z.date(),
});

// Minimal shape exposed to other users (search results, share lists).
export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  name: z.string(),
});

export type UserRegistration = z.infer<typeof UserRegistrationSchema>;
export type SafeUser = z.infer<typeof SafeUserSchema>;
export type PublicUser = z.infer<typeof PublicUserSchema>;

// Register entities with TypeORM
provide(ENTITIES, User);
provide(ENTITIES, UserCredential);
provide(ENTITIES, RefreshToken);
