import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { ILike, IsNull, Not } from 'typeorm';
import { Database } from '../data-source';
import { AuthService } from './auth/auth.service';
import { PublicUser, User } from './user';

export class UsersService {
  private readonly _repository = inject(Database).repositoryFor(User);
  private readonly _authService = inject(AuthService);

  async getById(id: string) {
    const user = await this._repository.findOne({
      where: { id },
      relations: { credentials: true },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username ?? null,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      timestamp: user.timestamp,
      updatedAt: user.updatedAt,
      credentialsCount: user.credentials.length,
    };
  }

  async updateProfile(
    userId: string,
    updates: { name?: string; username?: string }
  ) {
    const changes: Partial<User> = {};
    if (updates.name !== undefined) {
      changes.name = updates.name;
    }

    if (updates.username !== undefined) {
      // Usernames are stored lowercase so lookups are case-insensitive.
      const username = updates.username.trim().toLowerCase();
      const taken = await this._repository.findOne({
        where: { username, id: Not(userId) },
      });
      if (taken) {
        throw new HttpErrors.Conflict('That username is already taken');
      }
      changes.username = username;
    }

    if (Object.keys(changes).length > 0) {
      try {
        await this._repository.update(userId, changes);
      } catch (error: any) {
        // Concurrent updates can slip past the pre-check; the unique index
        // is the real arbiter (Postgres error 23505).
        if (error?.code === '23505') {
          throw new HttpErrors.Conflict('That username is already taken');
        }
        throw error;
      }
    }
    return this.getById(userId);
  }

  /**
   * Find people to share a wheel with, by username or display name.
   * Excludes the searching user and accounts without a username yet.
   */
  async search(query: string, excludeUserId: string): Promise<PublicUser[]> {
    const term = query.trim();
    if (!term) {
      return [];
    }

    // Accounts without a username (pre-backfill) can't be shared with, so
    // exclude them in the query rather than after the row limit.
    const users = await this._repository.find({
      where: [
        { username: ILike(`%${term}%`), id: Not(excludeUserId) },
        {
          name: ILike(`%${term}%`),
          username: Not(IsNull()),
          id: Not(excludeUserId),
        },
      ],
      take: 10,
      order: { username: 'ASC' },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username ?? null,
      name: u.name,
    }));
  }

  async deleteAccount(userId: string) {
    await this._authService.revokeAllSessions(userId);
    const result = await this._repository.delete(userId);
    return result.affected !== 0;
  }
}
