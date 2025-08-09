import { inject } from '@ee/di';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import HttpErrors from 'http-errors';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { Database } from '../../data-source';
import {
  User,
  UserCredential,
  RefreshToken,
  UserRegistration,
  UserLogin,
} from './user';

export interface JWTPayload {
  userId: string;
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

  // Configuration - in production, these should come from environment variables
  private readonly RP_NAME = 'Finance App';
  private readonly RP_ID = 'localhost'; // Change to your domain in production
  private readonly ORIGIN = 'http://localhost:4200'; // Change to your frontend URL
  private readonly SALT_ROUNDS = 12;
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = 30; // days

  /**
   * 🚀 PASSKEY REGISTRATION - The future is here!
   */
  async startPasskeyRegistration(
    userId: string
  ): Promise<PasskeyRegistrationOptions> {
    const user = await this._userRepository.findOne({
      where: { id: userId },
      relations: ['credentials'],
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    // Get existing credentials to exclude them
    const excludeCredentials = user.credentials.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports
        ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
        : undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName: this.RP_NAME,
      rpID: this.RP_ID,
      userID: new TextEncoder().encode(user.webAuthnUserId),
      userName: user.username,
      userDisplayName: user.name,
      attestationType: 'none', // We trust the client
      excludeCredentials,
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
    const credentialId = authenticationResponse.id;

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
   * 📧 REGISTER USER - Start with passkey preference!
   */
  async registerUser(
    userData: UserRegistration
  ): Promise<{ user: User; requiresPasskey: boolean }> {
    // Check if user already exists
    const existingUser = await this._userRepository.findOne({
      where: [{ username: userData.username }],
    });

    if (existingUser) {
      throw new HttpErrors.Conflict('User with this username already exists');
    }

    // Generate a unique WebAuthn user ID
    const webAuthnUserId = randomBytes(32).toString('base64url');

    // Create user
    const user = new User();
    user.name = userData.name;
    user.username = userData.username;
    user.webAuthnUserId = webAuthnUserId;
    user.isActive = true;

    // Only hash password if provided (we prefer passkeys!)
    if (userData.password) {
      user.passwordHash = await bcrypt.hash(
        userData.password,
        this.SALT_ROUNDS
      );
    }

    const savedUser = await this._userRepository.save(user);

    return {
      user: savedUser,
      requiresPasskey: !userData.password, // If no password, they must set up passkey
    };
  }

  /**
   * 🔐 LOGIN WITH PASSWORD (fallback option)
   */
  async loginWithPassword(credentials: UserLogin): Promise<AuthTokens> {
    if (!credentials.password) {
      throw new HttpErrors.BadRequest(
        'Password is required for password login'
      );
    }

    const user = await this._userRepository.findOneBy({
      username: credentials.username,
    });

    if (!user || !user.isActive) {
      throw new HttpErrors.Unauthorized('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpErrors.Unauthorized(
        'Account is temporarily locked due to too many failed attempts'
      );
    }

    if (!user.passwordHash) {
      throw new HttpErrors.Unauthorized(
        'Password login not available. Please use passkey authentication.'
      );
    }

    const isValidPassword = await bcrypt.compare(
      credentials.password,
      user.passwordHash
    );
    if (!isValidPassword) {
      await this._recordFailedLogin(user.id);
      throw new HttpErrors.Unauthorized('Invalid credentials');
    }

    // Reset failed attempts on successful login
    await this._updateSuccessfulLogin(user.id);

    return await this._generateTokens(user);
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
    hasPassword: boolean;
    securityScore: number;
  }> {
    const user = await this._userRepository.findOne({
      where: { id: userId },
      relations: ['credentials'],
    });

    if (!user) {
      throw new HttpErrors.NotFound('User not found');
    }

    const hasPassword = !!user.passwordHash;
    const passkeyCount = user.credentials.length;

    // Calculate security score (0-100)
    let securityScore = 0;
    if (passkeyCount > 0) securityScore += 60; // Passkeys are awesome!
    if (passkeyCount > 1) securityScore += 20; // Multiple passkeys even better!
    if (hasPassword) securityScore += 10; // Password as backup

    return {
      user,
      credentials: user.credentials,
      hasPassword,
      securityScore,
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

  // Private helper methods
  private async _generateTokens(user: User): Promise<AuthTokens> {
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutes
    };

    // For now, we'll use a simple token - this will be properly signed by the JWT plugin
    const accessToken = Buffer.from(JSON.stringify(payload)).toString('base64');

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
      accessToken,
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
