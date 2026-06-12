import { inject } from '@ee/di';
import { Database } from '../data-source';
import { AuthService } from './auth/auth.service';
import { User } from './user';

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
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      timestamp: user.timestamp,
      updatedAt: user.updatedAt,
      credentialsCount: user.credentials.length,
    };
  }

  async updateProfile(userId: string, updates: { name?: string }) {
    await this._repository.update(userId, updates);
    return this.getById(userId);
  }

  async deleteAccount(userId: string) {
    await this._authService.revokeAllSessions(userId);
    const result = await this._repository.delete(userId);
    return result.affected !== 0;
  }
}
