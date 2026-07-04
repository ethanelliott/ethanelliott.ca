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
import { LessThan } from 'typeorm';
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
  private readonly RP_NAME = process.env['RP_NAME'] || 'Trip';
  private readonly RP_ID = process.env['RP_ID'] || 'localhost';
  private readonly ORIGIN = process.env['ORIGIN'] || 'http://localhost:4200';
  private readonly REFRESH_TOKEN_EXPIRY = 30; // days

  constructor() {
    // Every login/refresh inserts a refresh-token row and revoked/expired
    // rows were never removed, so the table grew forever. Sweep daily.
    const timer = setInterval(() => {
      void this.deleteStaleRefreshTokens();
    }, 24 * 60 * 60 * 1000);
    timer.unref?.();
    // First sweep shortly after startup, once the DB connection is up.
    const initial = setTimeout(() => {
      void this.deleteStaleRefreshTokens();
    }, 60 * 1000);
    initial.unref?.();
  }

  private async deleteStaleRefreshTokens(): Promise<void> {
    try {
      await this._refreshTokenRepository.delete({
        expiresAt: LessThan(new Date()),
      });
      await this._refreshTokenRepository.delete({ revoked: true });
    } catch {
      // best-effort; retried on the next sweep
    }
  }

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
      userName: user.username,
      userDisplayName: user.name,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
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
    // NOTE: credential.id is ALREADY a base64url string, so this re-encodes
    // its ASCII bytes — the stored value is a double-encoded id, not the raw
    // WebAuthn credential id. It works because authentication (below) applies
    // the same transformation before looking rows up, but never "fix" one
    // side without migrating the stored column or every passkey breaks.
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
   * 🔑 PASSKEY AUTHENTICATION
   */
  async startPasskeyAuthentication(
    username?: string
  ): Promise<PasskeyAuthenticationOptions> {
    let allowCredentials: Array<{
      id: string;
      transports?: AuthenticatorTransportFuture[];
    }> = [];

    if (username) {
      const user = await this._userRepository.findOne({
        where: { username },
        relations: ['credentials'],
      });

      if (user && user.credentials.length > 0) {
        allowCredentials = user.credentials.map((cred) => ({
          id: cred.credentialId,
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
    // Deliberately double-encodes to match what registration stored — see the
    // note in completePasskeyRegistration before changing either side.
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

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpErrors.Unauthorized(
        'Account temporarily locked after too many failed attempts. Try again later.'
      );
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
   * 📧 REGISTER USER
   */
  async registerUser(
    userData: UserRegistration
  ): Promise<{ user: User; registrationOptions: PasskeyRegistrationOptions }> {
    const existingUser = await this._userRepository.findOne({
      where: [{ username: userData.username }],
    });

    if (existingUser) {
      throw new HttpErrors.Conflict('User with this username already exists');
    }

    const webAuthnUserId = randomBytes(32).toString('base64url');

    const user = new User();
    // Registration only collects a username; the display name defaults to it
    // and can be changed later from the profile screen.
    user.name = userData.username;
    user.username = userData.username;
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

    return { user, credentials: user.credentials };
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
      user: { id: user.id, username: user.username, name: user.name },
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
    // `null` (not `undefined`) so TypeORM actually clears the lock column.
    await this._userRepository.update(userId, {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null as unknown as undefined,
    });
  }
}
