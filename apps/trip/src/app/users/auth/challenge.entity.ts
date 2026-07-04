import { provide } from '@ee/di';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { ENTITIES } from '../../data-source';

/**
 * A pending WebAuthn ceremony (registration or login). Persisted so in-flight
 * logins survive server restarts and work across multiple instances.
 */
@Entity()
export class WebAuthnChallenge {
  @PrimaryColumn('text')
  sessionId!: string;

  @Column('text')
  challenge!: string;

  // Set for registration ceremonies; login is username-less (discoverable).
  @Column('text', { nullable: true })
  userId?: string;

  @Column('timestamp')
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

provide(ENTITIES, WebAuthnChallenge);
