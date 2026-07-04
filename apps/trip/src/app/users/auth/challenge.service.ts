import { inject } from '@ee/di';
import { randomBytes } from 'crypto';
import { LessThan } from 'typeorm';
import { Database } from '../../data-source';
import { WebAuthnChallenge } from './challenge.entity';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

/** DB-backed store for pending WebAuthn ceremonies. */
export class ChallengeService {
  private readonly _repository =
    inject(Database).repositoryFor(WebAuthnChallenge);

  constructor() {
    const timer = setInterval(() => {
      void this.deleteExpired();
    }, CLEANUP_INTERVAL_MS);
    timer.unref?.();
  }

  newSessionId(prefix: 'auth' | 'reg'): string {
    return `${prefix}_${randomBytes(24).toString('base64url')}`;
  }

  async put(
    sessionId: string,
    challenge: string,
    userId?: string
  ): Promise<void> {
    await this._repository.save(
      this._repository.create({
        sessionId,
        challenge,
        userId,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      })
    );
  }

  /** Fetch and consume a ceremony; returns null if unknown or expired. */
  async take(sessionId: string): Promise<WebAuthnChallenge | null> {
    const record = await this._repository.findOneBy({ sessionId });
    if (!record) return null;
    await this._repository.delete({ sessionId });
    if (record.expiresAt < new Date()) return null;
    return record;
  }

  private async deleteExpired(): Promise<void> {
    try {
      await this._repository.delete({ expiresAt: LessThan(new Date()) });
    } catch {
      // best-effort cleanup; retried on the next tick
    }
  }
}
