import { inject } from '@ee/di';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { AuthService } from './auth.service';
import { UsersService } from '../users.service';
import { UserRegistration } from '../user';
import {
  RegistrationResponse,
  CompleteRegistrationResponse,
} from './auth.types';

export class RegistrationService {
  private readonly _authService = inject(AuthService);
  private readonly _usersService = inject(UsersService);

  async startRegistration(
    userData: UserRegistration
  ): Promise<RegistrationResponse> {
    const { user, registrationOptions } = await this._authService.registerUser(
      userData
    );

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email ?? null,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt || null,
        timestamp: user.timestamp,
        updatedAt: user.updatedAt,
      },
      registrationOptions: {
        userId: registrationOptions.userId,
        options: registrationOptions.options,
        challenge: registrationOptions.challenge,
      },
      sessionId: `reg_${user.id}_${Date.now()}`,
      message:
        '🔑 Account created! Complete passkey setup to secure your account.',
    };
  }

  async completeRegistration(
    userId: string,
    credential: RegistrationResponseJSON,
    challenge: string,
    fastify: any
  ): Promise<CompleteRegistrationResponse> {
    const userCredential = await this._authService.completePasskeyRegistration(
      userId,
      credential,
      challenge
    );

    const user = await this._usersService.getById(userId);
    if (!user) {
      throw new Error('User not found after registration');
    }

    // Issue a real session so the user lands straight in the app after signup
    const tokens = await this._authService._generateTokens({
      id: user.id,
      username: user.username,
      name: user.name,
    } as any);

    const accessToken = fastify.signToken({
      id: userId,
      username: user.username,
    });

    return {
      success: true,
      user: { id: userId, username: user.username, name: user.name },
      credential: {
        id: userCredential.id,
        deviceType: userCredential.deviceType,
        backedUp: userCredential.backedUp,
        createdAt: userCredential.createdAt,
      },
      accessToken,
      refreshToken: tokens.refreshToken,
      message: '🎉 Welcome! Your account is now secured with a passkey.',
    };
  }
}
