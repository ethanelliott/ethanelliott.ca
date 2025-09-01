import { inject } from '@ee/di';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { AuthService } from './auth.service';
import {
  LoginStartResponse,
  TokenRefreshResponse,
  LogoutResponse,
  CompleteLoginResponse,
} from './auth.types';

export class LoginService {
  private readonly _authService = inject(AuthService);

  async startLogin(): Promise<LoginStartResponse> {
    const authenticationOptions =
      await this._authService.startPasskeyAuthentication();

    const sessionId = `auth_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    return {
      success: true,
      options: authenticationOptions.options,
      sessionId,
    };
  }

  async completeLogin(
    credential: AuthenticationResponseJSON,
    challenge: string,
    fastify: any
  ): Promise<CompleteLoginResponse> {
    const tokens = await this._authService.completePasskeyAuthentication(
      credential,
      challenge
    );

    const accessToken = fastify.signToken({
      id: tokens.user.id,
      username: tokens.user.username,
    });

    return {
      success: true,
      user: tokens.user,
      accessToken,
      refreshToken: tokens.refreshToken,
      message: '🚀 Welcome back! Logged in with passkey.',
    };
  }

  async refreshTokens(
    refreshToken: string,
    fastify: any
  ): Promise<TokenRefreshResponse> {
    const tokens = await this._authService.refreshTokens(refreshToken);

    const accessToken = fastify.signToken({
      id: tokens.user.id,
      username: tokens.user.username,
    });

    return {
      success: true,
      accessToken,
      refreshToken: tokens.refreshToken,
      message: 'Tokens refreshed successfully',
    };
  }

  async logout(refreshToken?: string): Promise<LogoutResponse> {
    if (refreshToken) {
      await this._authService.logout(refreshToken);
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }
}
