import { inject } from '@ee/di';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users.service';
import {
  ProfileResponse,
  UpdateProfileResponse,
  DeleteAccountResponse,
  UpdateProfileRequest,
} from './profile.types';

export class ProfileService {
  private readonly _authService = inject(AuthService);
  private readonly _usersService = inject(UsersService);

  async getProfile(userId: string): Promise<ProfileResponse> {
    const profile = await this._authService.getUserProfile(userId);

    return {
      success: true,
      user: {
        id: profile.user.id,
        name: profile.user.name,
        username: profile.user.username,
        isActive: profile.user.isActive,
        requireMFA: profile.user.requireMFA,
        lastLoginAt: profile.user.lastLoginAt || null,
        timestamp: profile.user.timestamp,
        updatedAt: profile.user.updatedAt,
      },
      credentials: profile.credentials.map((cred) => ({
        id: cred.id,
        deviceType: cred.deviceType,
        backedUp: cred.backedUp,
        createdAt: cred.createdAt,
        lastUsed: cred.lastUsed,
      })),
      hasPassword: profile.hasPassword,
      securityScore: profile.securityScore,
    };
  }

  async updateProfile(
    userId: string,
    updates: UpdateProfileRequest
  ): Promise<UpdateProfileResponse> {
    await this._usersService.updateProfile(userId, updates);

    // Get the fresh user data to ensure we have all required fields
    const profile = await this._authService.getUserProfile(userId);

    return {
      success: true,
      user: {
        id: profile.user.id,
        name: profile.user.name,
        username: profile.user.username,
        isActive: profile.user.isActive,
        requireMFA: profile.user.requireMFA,
        lastLoginAt: profile.user.lastLoginAt || null,
        timestamp: profile.user.timestamp,
        updatedAt: profile.user.updatedAt,
      },
      message: 'Profile updated successfully',
    };
  }

  async deleteAccount(userId: string): Promise<DeleteAccountResponse> {
    const deleted = await this._usersService.deleteAccount(userId);

    if (!deleted) {
      throw new Error('Failed to delete account');
    }

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  }
}
