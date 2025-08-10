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
  template: `
    <div class="gradient-background">
      <div class="wrapper">
        <div class="login-container">
          <div class="brand-section">
            <div class="logo">
              <mat-icon class="logo-icon" fontIcon="fa-wallet"></mat-icon>
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
                  <mat-icon
                    class="security-icon"
                    fontIcon="fa-shield-halved"
                  ></mat-icon>
                  <h3>Passwordless Authentication</h3>
                  <p>Sign in securely using your passkey.</p>
                  <button
                    mat-raised-button
                    color="primary"
                    (click)="loginWithPasskey()"
                    class="login-button"
                  >
                    <mat-icon fontIcon="fa-fingerprint"></mat-icon>
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
  styles: `
    .gradient-background {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, 
        #0f1419 0%, 
        #1a2e2c 25%, 
        #2d4a3b 50%, 
        #1e3a32 75%, 
        #121b1f 100%);
      overflow: hidden;
    }

    .wrapper {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }

    .login-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      width: 100%;
      max-width: 400px;
    }

    .brand-section {
      text-align: center;
      color: white;
    }

    .logo {
      margin-bottom: 16px;
    }

    .logo-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(----mat-sys-primary);
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }

    .brand-title {
      font-size: 2.5rem;
      font-weight: 300;
      margin: 0;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    .login-card {
      width: 100%;
      backdrop-filter: blur(20px);
      border: 1px solid var(--mat-sys-outline-variant);
      box-shadow: var(--mat-sys-level2);
      border-radius: 16px;
      overflow: hidden;
    }

    .login-card mat-card-header {
      text-align: center;
      padding: 24px 24px 16px 24px;
    }

    .login-card h2 {
      font-size: 1.5rem;
      font-weight: 500;
      margin: 0;
      color: var(--mat-sys-on-surface);
    }

    .login-content {
      padding: 16px 0;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 32px;
    }

    .loading-state p {
      margin-top: 16px;
      color: var(--mat-sys-on-surface-variant);
    }

    .passkey-info {
      text-align: center;
      padding: 16px;
    }

    .security-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--mat-sys-primary);
      margin-bottom: 16px;
    }

    .passkey-info h3 {
      font-size: 1.25rem;
      font-weight: 500;
      margin: 0 0 12px 0;
      color: var(--mat-sys-on-surface);
    }

    .passkey-info p {
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 24px 0;
      line-height: 1.5;
    }

    .login-button {
      gap: 8px;
      padding: 12px 24px;
      font-size: 1rem;
      border-radius: 24px;
    }

    .footer-links {
      text-align: center;
      color: white;
    }

    .footer-links a {
      color: white;
      text-decoration: none;
      font-weight: 500;
      border-bottom: 1px solid transparent;
      transition: border-bottom-color 0.2s ease;
    }

    .footer-links a:hover {
      border-bottom-color: white;
    }

    @media (max-width: 768px) {
      .login-container {
        max-width: 100%;
        padding: 0 16px;
      }

      .brand-title {
        font-size: 2rem;
      }

      .login-card {
        margin: 0;
      }
    }
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
        this._http.post('http://localhost:8080/users/login', {
          username: this.username() || undefined,
        })
      );

      console.log('Authentication started:', authResponse);

      // Step 2: Get passkey assertion
      const passkeyAssertion = await startAuthentication(authResponse.options);

      console.log('Passkey assertion:', passkeyAssertion);

      // Step 3: Complete authentication
      const completeResponse: any = await firstValueFrom(
        this._http.post('http://localhost:8080/users/login/complete', {
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
