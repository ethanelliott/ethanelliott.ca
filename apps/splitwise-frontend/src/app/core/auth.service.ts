import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { environment } from '../../environments/environment';
import { Profile } from './models';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = environment.apiUrl;

  /** Current signed-in user profile (loaded lazily). */
  readonly profile = signal<Profile | null>(null);

  isAuthenticated(): boolean {
    return !!localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  private storeTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  /** Passwordless login with a passkey. */
  async loginWithPasskey(username?: string): Promise<void> {
    const start: any = await firstValueFrom(
      this.http.post(`${this.baseUrl}/users/login`, {
        username: username || undefined,
      })
    );

    const assertion = await startAuthentication({ optionsJSON: start.options });

    const complete: any = await firstValueFrom(
      this.http.post(`${this.baseUrl}/users/login/complete`, {
        sessionId: start.sessionId,
        credential: assertion,
      })
    );

    this.storeTokens(complete.accessToken, complete.refreshToken);
  }

  /** Account creation: create the user, then register a passkey. */
  async register(input: {
    name: string;
    username: string;
    email?: string;
  }): Promise<void> {
    const start: any = await firstValueFrom(
      this.http.post(`${this.baseUrl}/users/register`, input)
    );

    const attestation = await startRegistration({
      optionsJSON: start.registrationOptions.options,
    });

    const complete: any = await firstValueFrom(
      this.http.post(`${this.baseUrl}/users/register/complete`, {
        sessionId: start.sessionId,
        credential: attestation,
      })
    );

    this.storeTokens(complete.accessToken, complete.refreshToken);
  }

  async loadProfile(): Promise<Profile | null> {
    try {
      const res: any = await firstValueFrom(
        this.http.get(`${this.baseUrl}/users/profile`)
      );
      this.profile.set(res.user);
      return res.user;
    } catch {
      return null;
    }
  }

  async updateProfile(updates: {
    name?: string;
    email?: string;
  }): Promise<void> {
    const res: any = await firstValueFrom(
      this.http.put(`${this.baseUrl}/users/profile`, updates)
    );
    this.profile.set(res.user);
  }

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/users/logout`, { refreshToken })
      );
    } catch {
      // ignore network errors on logout
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.profile.set(null);
    this.router.navigate(['/login']);
  }
}
