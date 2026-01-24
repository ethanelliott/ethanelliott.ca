import { HttpClient } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { environment } from '../../environments/environment';
import { FormsModule } from '@angular/forms';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { startAuthentication } from '@simplewebauthn/browser';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCard,
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
          <div class="header-section">
            <div class="brand-badge">
              <mat-icon>account_balance_wallet</mat-icon>
              <span>Finances</span>
            </div>
            <h1 class="page-title">
              Welcome<br />
              <span class="highlight">Back.</span>
            </h1>
          </div>

          <mat-card class="login-card">
            <mat-card-content>
              <div class="login-content">
                @if (isLoggingIn()) {
                <div class="loading-state">
                  <mat-spinner diameter="48" strokeWidth="4"></mat-spinner>
                  <p>Authenticating...</p>
                </div>
                } @else {
                <div class="passkey-info">
                  <div class="icon-circle">
                    <mat-icon>fingerprint</mat-icon>
                  </div>
                  <h3>Passkey Login</h3>
                  <p>Secure, passwordless authentication</p>
                  <button
                    mat-flat-button
                    color="primary"
                    (click)="loginWithPasskey()"
                    class="login-button"
                  >
                    Sign In with Passkey
                    <mat-icon iconPosition="end">arrow_forward</mat-icon>
                  </button>
                </div>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <div class="footer-links">
            <p>New here? <a routerLink="/register">Create an account</a></p>
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
        this._http.post(`${environment.apiUrl}/users/login`, {
          username: this.username() || undefined,
        })
      );

      console.log('Authentication started:', authResponse);

      // Step 2: Get passkey assertion
      const passkeyAssertion = await startAuthentication(authResponse.options);

      console.log('Passkey assertion:', passkeyAssertion);

      // Step 3: Complete authentication
      const completeResponse: any = await firstValueFrom(
        this._http.post(`${environment.apiUrl}/users/login/complete`, {
          sessionId: authResponse.sessionId,
          credential: passkeyAssertion,
        })
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
