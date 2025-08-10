import { inject } from '@ee/di';
import { AuthService } from '../auth/auth.service';
import {
  DeletePasskeyResponse,
  RevokeAllSessionsResponse,
} from './security.types';

export class SecurityService {
  private readonly _authService = inject(AuthService);

  async deletePasskey(
    userId: string,
    credentialId: string
  ): Promise<DeletePasskeyResponse> {
    await this._authService.deletePasskey(userId, credentialId);

    return {
      success: true,
      message: 'Passkey deleted successfully',
    };
  }

  async revokeAllSessions(userId: string): Promise<RevokeAllSessionsResponse> {
    await this._authService.revokeAllSessions(userId);

    return {
      success: true,
      message: 'All sessions revoked successfully',
    };
  }
}
