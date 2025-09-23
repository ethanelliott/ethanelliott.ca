import { HttpClient } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCard, MatCardContent, MatCardHeader } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { startAuthentication } from '@simplewebauthn/browser';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'fin-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCard,
    MatCardHeader,
    MatCardContent,
    MatButton,
    MatIcon,
    MatProgressSpinnerModule,
    RouterModule,
    FormsModule,
  ],
  styleUrl: './login.component.scss',
  template: `
    <div class="gradient-background">
      <div class="wrapper">
        <div class="login-container">
          <div class="brand-section">
            <div class="logo">
              <mat-icon class="logo-icon">account_balance_wallet</mat-icon>
            </div>
            <h1 class="brand-title">Finances</h1>
          </div>

          <mat-card class="login-card">
            <mat-card-header>
              <h2>Welcome Back</h2>
            </mat-card-header>
            <mat-card-content>
              <div class="login-content">
                @if (isLoggingIn()) {
                <div class="loading-state">
                  <mat-spinner diameter="32"></mat-spinner>
                  <p>Authenticating with your passkey...</p>
                </div>
                } @else {
                <div class="passkey-info">
                  <mat-icon class="security-icon">security ></mat-icon>
                  <h3>Passwordless Authentication</h3>
                  <p>Sign in securely using your passkey.</p>
                  <button
                    mat-raised-button
                    color="primary"
                    (click)="loginWithPasskey()"
                    class="login-button"
                  >
                    <mat-icon>fingerprint</mat-icon>
                    Sign In with Passkey
                  </button>
                </div>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <div class="footer-links">
            <p>
              Don't have an account? <a routerLink="/register">Sign up here</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class UserLogin {
  private _http = inject(HttpClient);
  private _router = inject(Router);

  username = signal('');
  isLoggingIn = signal(false);

  constructor() {
    afterNextRender({
      write: () => {
        this.loginWithPasskey();
      },
    });
  }

  async loginWithPasskey() {
    this.isLoggingIn.set(true);

    try {
      // Step 1: Start passkey authentication
      const authResponse: any = await firstValueFrom(
        this._http.post('https://finances-service.elliott.haus/users/login', {
          username: this.username() || undefined,
        })
      );

      console.log('Authentication started:', authResponse);

      // Step 2: Get passkey assertion
      const passkeyAssertion = await startAuthentication(authResponse.options);

      console.log('Passkey assertion:', passkeyAssertion);

      // Step 3: Complete authentication
      const completeResponse: any = await firstValueFrom(
        this._http.post(
          'https://finances-service.elliott.haus/users/login/complete',
          {
            sessionId: authResponse.sessionId,
            credential: passkeyAssertion,
          }
        )
      );

      console.log('Authentication completed:', completeResponse);

      // Store tokens for future API calls
      localStorage.setItem('accessToken', completeResponse.accessToken);
      localStorage.setItem('refreshToken', completeResponse.refreshToken);

      await this._router.navigate(['/dashboard']);
    } catch (error: any) {
      console.error('Login failed:', error);
    } finally {
      this.isLoggingIn.set(false);
    }
  }
}
