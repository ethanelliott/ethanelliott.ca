import { inject } from '@ee/di';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import { randomBytes } from 'crypto';
import HttpErrors from 'http-errors';
import { Database } from '../../data-source';
import { RefreshToken, User, UserCredential, UserRegistration } from '../user';

export interface JWTPayload {
  id: string;
  username: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    name: string;
  };
}

export interface PasskeyRegistrationOptions {
  userId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge: string;
}

export interface PasskeyAuthenticationOptions {
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge: string;
}

export class AuthService {
  private readonly _userRepository = inject(Database).repositoryFor(User);
  private readonly _credentialRepository =
    inject(Database).repositoryFor(UserCredential);
  private readonly _refreshTokenRepository =
    inject(Database).repositoryFor(RefreshToken);

  // Configuration - uses environment variables for flexibility
  private readonly RP_NAME = 'Finance App';
  private readonly RP_ID = process.env['RP_ID'] || 'localhost';
  private readonly ORIGIN = process.env['ORIGIN'] || 'https://localhost:4200';
  private readonly ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = 30; // days

  /**
   * 🚀 PASSKEY REGISTRATION - The future is here!
   */
  async startPasskeyRegistration(
    userId: string
  ): Promise<PasskeyRegistrationOptions> {
    const user = await this._userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }
    const options = await generateRegistrationOptions({
      rpName: this.RP_NAME,
      rpID: this.RP_ID,
      userID: new TextEncoder().encode(user.webAuthnUserId) as any,
      userName: user.username,
      userDisplayName: user.name,
      attestationType: 'none', // We trust the client
      authenticatorSelection: {
        residentKey: 'preferred', // Prefer passkeys stored on device
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', // Prefer built-in authenticators
      },
      supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
    });

    return {
      userId,
      options,
      challenge: options.challenge,
    };
  }

  /**
   * Complete passkey registration
   */
  async completePasskeyRegistration(
    userId: string,
    registrationResponse: RegistrationResponseJSON,
    expectedChallenge: string
  ): Promise<UserCredential> {
    const user = await this._userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge,
        expectedOrigin: this.ORIGIN,
        expectedRPID: this.RP_ID,
        requireUserVerification: true,
      });
    } catch (error: any) {
      throw new HttpErrors.BadRequest(
        `Passkey verification failed: ${error?.message || 'Unknown error'}`
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new HttpErrors.BadRequest(
        'Passkey registration verification failed'
      );
    }

    const { credential } = verification.registrationInfo;

    // Store the credential
    const userCredential = new UserCredential();
    userCredential.credentialId = Buffer.from(credential.id).toString(
      'base64url'
    );
    userCredential.publicKey = Buffer.from(credential.publicKey).toString(
      'base64url'
    );
    userCredential.counter = credential.counter;
    userCredential.userId = userId;
    userCredential.deviceType =
      verification.registrationInfo.credentialDeviceType;
    userCredential.backedUp = verification.registrationInfo.credentialBackedUp;
    userCredential.transports = JSON.stringify(
      registrationResponse.response.transports
    );

    return await this._credentialRepository.save(userCredential);
  }

  /**
   * 🔑 PASSKEY AUTHENTICATION - Secure and passwordless!
   */
  async startPasskeyAuthentication(
    username?: string
  ): Promise<PasskeyAuthenticationOptions> {
    let allowCredentials: Array<{
      id: string;
      transports?: AuthenticatorTransportFuture[];
    }> = [];

    if (username) {
      // If username provided, only allow that user's credentials
      const user = await this._userRepository.findOne({
        where: { username },
        relations: ['credentials'],
      });

      if (user && user.credentials.length > 0) {
        allowCredentials = user.credentials.map((cred) => ({
          id: cred.credentialId, // This should already be in base64url format from storage
          transports: cred.transports
            ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
            : undefined,
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.RP_ID,
      allowCredentials:
        allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: 'preferred',
    });

    return {
      options,
      challenge: options.challenge,
    };
  }

  /**
   * Complete passkey authentication and return tokens
   */
  async completePasskeyAuthentication(
    authenticationResponse: AuthenticationResponseJSON,
    expectedChallenge: string
  ): Promise<AuthTokens> {
    const rawCredentialId = authenticationResponse.id;

    // Convert the credential ID to match our storage format (base64url)
    const credentialId = Buffer.from(rawCredentialId).toString('base64url');

    const credential = await this._credentialRepository.findOneBy({
      credentialId: credentialId,
    });

    if (!credential) {
      throw new HttpErrors.Unauthorized('Passkey not found');
    }

    const user = await this._userRepository.findOneBy({
      id: credential.userId,
    });
    if (!user || !user.isActive) {
      throw new HttpErrors.Unauthorized('User not found or inactive');
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge,
        expectedOrigin: this.ORIGIN,
        expectedRPID: this.RP_ID,
        credential: {
          id: credential.credentialId, // Use the stored credential ID (base64url)
          publicKey: new Uint8Array(
            Buffer.from(credential.publicKey, 'base64url')
          ),
          counter: credential.counter,
          transports: credential.transports
            ? (JSON.parse(
                credential.transports
              ) as AuthenticatorTransportFuture[])
            : undefined,
        },
        requireUserVerification: true,
      });
    } catch (error: any) {
      await this._recordFailedLogin(user.id);
      throw new HttpErrors.Unauthorized(
        `Passkey authentication failed: ${error?.message || 'Unknown error'}`
      );
    }

    if (!verification.verified) {
      await this._recordFailedLogin(user.id);
      throw new HttpErrors.Unauthorized(
        'Passkey authentication verification failed'
      );
    }

    // Update credential counter
    await this._credentialRepository.update(credential.id, {
      counter: verification.authenticationInfo.newCounter,
      lastUsed: new Date(),
    });

    // Update user login info
    await this._updateSuccessfulLogin(user.id);

    // Generate tokens
    return await this._generateTokens(user);
  }

  /**
   * 📧 REGISTER USER - Passkeys required for maximum security!
   */
  async registerUser(
    userData: UserRegistration
  ): Promise<{ user: User; registrationOptions: PasskeyRegistrationOptions }> {
    // Check if user already exists
    const existingUser = await this._userRepository.findOne({
      where: [{ username: userData.username }],
    });

    if (existingUser) {
      throw new HttpErrors.Conflict('User with this username already exists');
    }

    // Generate a unique WebAuthn user ID
    const webAuthnUserId = randomBytes(32).toString('base64url');

    // Create user without password - passkeys only!
    const user = new User();
    user.name = userData.name;
    user.username = userData.username;
    user.webAuthnUserId = webAuthnUserId;
    user.isActive = true;
    // No password hash - passkeys provide better security!

    const savedUser = await this._userRepository.save(user);

    // Immediately start passkey registration process
    const registrationOptions = await this.startPasskeyRegistration(
      savedUser.id
    );

    return {
      user: savedUser,
      registrationOptions,
    };
  }

  /**
   *  REFRESH TOKENS
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const tokenRecord = await this._refreshTokenRepository.findOneBy({
      token: refreshToken,
      revoked: false,
    });

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw new HttpErrors.Unauthorized('Invalid or expired refresh token');
    }

    const user = await this._userRepository.findOneBy({
      id: tokenRecord.userId,
    });
    if (!user || !user.isActive) {
      throw new HttpErrors.Unauthorized('User not found or inactive');
    }

    // Revoke the old refresh token
    await this._refreshTokenRepository.update(tokenRecord.id, {
      revoked: true,
    });

    // Generate new tokens
    return await this._generateTokens(user);
  }

  /**
   * 📝 GET USER PROFILE WITH SECURITY INFO
   */
  async getUserProfile(userId: string): Promise<{
    user: User;
    credentials: UserCredential[];
  }> {
    const user = await this._userRepository.findOne({
      where: { id: userId },
      relations: {
        credentials: true,
      },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    return {
      user,
      credentials: user.credentials,
    };
  }

  /**
   * 🚫 LOGOUT
   */
  async logout(refreshToken: string): Promise<void> {
    await this._refreshTokenRepository.update(
      { token: refreshToken },
      { revoked: true }
    );
  }

  /**
   * 🗑️ REVOKE ALL SESSIONS
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this._refreshTokenRepository.update(
      { userId, revoked: false },
      { revoked: true }
    );
  }

  /**
   * ❌ DELETE PASSKEY
   */
  async deletePasskey(userId: string, credentialId: string): Promise<void> {
    const result = await this._credentialRepository.delete({
      userId,
      credentialId,
    });

    if (result.affected === 0) {
      throw new HttpErrors.NotFound('Passkey not found');
    }
  }

  /**
   * 🗑️ DELETE ALL USERS (for testing/admin purposes)
   */
  async deleteAllUsers(): Promise<void> {
    await this._refreshTokenRepository.deleteAll();
    await this._credentialRepository.deleteAll();
    await this._userRepository.deleteAll();
  }

  // Private helper methods
  async _generateTokens(user: User): Promise<AuthTokens> {
    // Generate refresh token
    const refreshTokenValue = randomBytes(32).toString('hex');
    const refreshToken = new RefreshToken();
    refreshToken.token = refreshTokenValue;
    refreshToken.userId = user.id;
    refreshToken.expiresAt = new Date(
      Date.now() + this.REFRESH_TOKEN_EXPIRY * 24 * 60 * 60 * 1000
    );

    await this._refreshTokenRepository.save(refreshToken);

    return {
      accessToken: '', // This will be properly signed by the service layer
      refreshToken: refreshTokenValue,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
      },
    };
  }

  private async _recordFailedLogin(userId: string): Promise<void> {
    const user = await this._userRepository.findOneBy({ id: userId });
    if (!user) return;

    const failedAttempts = user.failedLoginAttempts + 1;
    const updates: Partial<User> = { failedLoginAttempts: failedAttempts };

    // Lock account after 5 failed attempts for 30 minutes
    if (failedAttempts >= 5) {
      updates.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }

    await this._userRepository.update(userId, updates);
  }

  private async _updateSuccessfulLogin(userId: string): Promise<void> {
    await this._userRepository.update(userId, {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: undefined,
    });
  }
}
