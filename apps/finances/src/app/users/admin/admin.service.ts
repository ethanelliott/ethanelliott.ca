import { inject } from '@ee/di';
import { AuthService } from '../auth/auth.service';
import { z } from 'zod';

export const WipeAllUsersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type WipeAllUsersResponse = z.infer<typeof WipeAllUsersResponseSchema>;

export class AdminService {
  private readonly _authService = inject(AuthService);

  async wipeAllUsers(): Promise<WipeAllUsersResponse> {
    await this._authService.deleteAllUsers();

    return {
      success: true,
      message: 'All users deleted successfully',
    };
  }
}
