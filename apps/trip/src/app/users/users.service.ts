import { inject } from '@ee/di';
import { ILike } from 'typeorm';
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
      username: user.username,
      email: user.email ?? null,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      timestamp: user.timestamp,
      updatedAt: user.updatedAt,
      credentialsCount: user.credentials.length,
    };
  }

  async getByUsername(username: string) {
    const user = await this._repository.findOneBy({ username });
    return user ? this.getById(user.id) : null;
  }

  /** Find the underlying entity for a username (used when adding members). */
  async findEntityByUsername(username: string): Promise<User | null> {
    return this._repository.findOneBy({ username });
  }

  /** Find the underlying entity by id. */
  async findEntityById(id: string): Promise<User | null> {
    return this._repository.findOneBy({ id });
  }

  /** Search users by username or name, excluding the requester. */
  async search(query: string, excludeUserId: string): Promise<PublicUser[]> {
    const q = query.trim();
    if (!q) return [];

    // Escape LIKE wildcards so "%"/"_" in the query match literally.
    const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const pattern = ILike(`%${escaped}%`);
    const users = await this._repository.find({
      where: [{ username: pattern }, { name: pattern }],
      take: 10,
    });

    return users
      .filter((u) => u.id !== excludeUserId)
      .map((u) => ({ id: u.id, name: u.name, username: u.username }));
  }

  async updateProfile(userId: string, updates: { name?: string; email?: string }) {
    await this._repository.update(userId, updates);
    return this.getById(userId);
  }

  async deleteAccount(userId: string) {
    await this._authService.revokeAllSessions(userId);
    const result = await this._repository.delete(userId);
    return result.affected !== 0;
  }
}
