import { inject } from '@ee/di';
import { Database } from '../data-source';
import { AuthService } from './auth.service';
import { User } from './user';

export class UsersService {
  private readonly _repository = inject(Database).repositoryFor(User);

  private readonly _authService = inject(AuthService);

  async getById(id: string) {
    const user = await this._repository.findOne({
      where: { id },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      timestamp: user.timestamp,
      updatedAt: user.updatedAt,
      hasPassword: !!user.passwordHash,
      // credentialsCount: user.credentials.length,
    };
  }

  async getByUsername(username: string) {
    const user = await this._repository.findOneBy({ username });
    return user ? this.getById(user.id) : null;
  }

  async updateProfile(userId: string, updates: { name?: string }) {
    await this._repository.update(userId, updates);
    return this.getById(userId);
  }

  async deleteAccount(userId: string) {
    // First revoke all sessions
    await this._authService.revokeAllSessions(userId);

    // Delete user (cascade should handle credentials and refresh tokens)
    const result = await this._repository.delete(userId);
    return result.affected !== 0;
  }

  async getUserSecurity(userId: string) {
    return this._authService.getUserProfile(userId);
  }
}
