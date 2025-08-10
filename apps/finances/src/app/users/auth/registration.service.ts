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
        isActive: user.isActive,
        requireMFA: user.requireMFA,
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
        '🔑 Account created! Please complete passkey setup to secure your account.',
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

    // Fetch user data for response
    const user = await this._usersService.getById(userId);
    if (!user) {
      throw new Error('User not found after registration');
    }

    // Generate tokens
    const accessToken = fastify.signToken({
      userId: userId,
      username: user.username,
    });

    const refreshTokenValue =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    return {
      success: true,
      user: {
        id: userId,
        username: user.username,
        name: user.name,
      },
      credential: {
        id: userCredential.id,
        deviceType: userCredential.deviceType,
        backedUp: userCredential.backedUp,
        createdAt: userCredential.createdAt,
      },
      accessToken,
      refreshToken: refreshTokenValue,
      message: '🎉 Welcome! Your account is now secured with a passkey.',
    };
  }
}
