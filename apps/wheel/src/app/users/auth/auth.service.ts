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

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
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
  private readonly RP_NAME = process.env['RP_NAME'] || 'Wheel';
  private readonly RP_ID = process.env['RP_ID'] || 'localhost';
  private readonly ORIGIN = process.env['ORIGIN'] || 'http://localhost:4200';
  private readonly REFRESH_TOKEN_EXPIRY = 30; // days

  /**
   * 🚀 PASSKEY REGISTRATION
   */
  async startPasskeyRegistration(
    userId: string
  ): Promise<PasskeyRegistrationOptions> {
    const user = await this._userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }
    const options = await generateRegistrationOptions({
      rpName: this.RP_NAME,
      rpID: this.RP_ID,
      userID: new TextEncoder().encode(user.webAuthnUserId) as any,
      // The authenticator only needs a stable handle and a friendly display
      // name to show in its own UI.
      userName: user.username || `wheel-${user.id.slice(0, 8)}`,
      userDisplayName: user.name,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
      supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
    });

    return { userId, options, challenge: options.challenge };
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
   * 🔑 PASSKEY AUTHENTICATION (usernameless / discoverable credentials)
   */
  async startPasskeyAuthentication(): Promise<PasskeyAuthenticationOptions> {
    const options = await generateAuthenticationOptions({
      rpID: this.RP_ID,
      userVerification: 'preferred',
    });

    return { options, challenge: options.challenge };
  }

  /**
   * Complete passkey authentication and return tokens
   */
  async completePasskeyAuthentication(
    authenticationResponse: AuthenticationResponseJSON,
    expectedChallenge: string
  ): Promise<AuthTokens> {
    const rawCredentialId = authenticationResponse.id;
    const credentialId = Buffer.from(rawCredentialId).toString('base64url');

    const credential = await this._credentialRepository.findOneBy({
      credentialId,
    });

    if (!credential) {
      throw new HttpErrors.Unauthorized('Passkey not found');
    }

    const user = await this._userRepository.findOneBy({
      id: credential.userId as any,
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
          id: credential.credentialId,
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

    await this._credentialRepository.update(credential.id, {
      counter: verification.authenticationInfo.newCounter,
      lastUsed: new Date(),
    });

    await this._updateSuccessfulLogin(user.id);

    return await this._generateTokens(user);
  }

  /**
   * 📧 REGISTER USER (generates a fresh account with a unique username)
   */
  async registerUser(
    userData: UserRegistration
  ): Promise<{ user: User; registrationOptions: PasskeyRegistrationOptions }> {
    const webAuthnUserId = randomBytes(32).toString('base64url');

    const user = new User();
    user.name = userData?.name?.trim() || 'Wheel user';
    user.username = await this._generateUniqueUsername();
    user.webAuthnUserId = webAuthnUserId;
    user.isActive = true;

    const savedUser = await this._userRepository.save(user);

    const registrationOptions = await this.startPasskeyRegistration(
      savedUser.id
    );

    return { user: savedUser, registrationOptions };
  }

  /**
   * 🔄 REFRESH TOKENS
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
      id: tokenRecord.userId as any,
    });
    if (!user || !user.isActive) {
      throw new HttpErrors.Unauthorized('User not found or inactive');
    }

    await this._refreshTokenRepository.update(tokenRecord.id, {
      revoked: true,
    });

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
      relations: { credentials: true },
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    // Accounts created before usernames existed get one on first load.
    if (!user.username) {
      user.username = await this._generateUniqueUsername();
      await this._userRepository.update(userId, { username: user.username });
    }

    return { user, credentials: user.credentials };
  }

  /** Generate a random, unused handle like `wheel-4f9c2a`. */
  private async _generateUniqueUsername(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `wheel-${randomBytes(3).toString('hex')}`;
      const existing = await this._userRepository.findOneBy({
        username: candidate,
      });
      if (!existing) {
        return candidate;
      }
    }
    // 16.7M combinations — colliding ten times in a row means something is
    // deeply wrong with the RNG or the table.
    throw new Error('Could not generate a unique username');
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
      { userId: userId as any, revoked: false },
      { revoked: true }
    );
  }

  // Private helper methods
  async _generateTokens(user: User): Promise<AuthTokens> {
    const refreshTokenValue = randomBytes(32).toString('hex');
    const refreshToken = new RefreshToken();
    refreshToken.token = refreshTokenValue;
    refreshToken.userId = user.id as any;
    refreshToken.expiresAt = new Date(
      Date.now() + this.REFRESH_TOKEN_EXPIRY * 24 * 60 * 60 * 1000
    );

    await this._refreshTokenRepository.save(refreshToken);

    return {
      accessToken: '', // Signed by the service layer using fastify.signToken
      refreshToken: refreshTokenValue,
      user: { id: user.id, name: user.name },
    };
  }

  private async _recordFailedLogin(userId: string): Promise<void> {
    const user = await this._userRepository.findOneBy({ id: userId });
    if (!user) return;

    const failedAttempts = user.failedLoginAttempts + 1;
    const updates: Partial<User> = { failedLoginAttempts: failedAttempts };

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
