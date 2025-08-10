import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader } from '@angular/material/card';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { startRegistration } from '@simplewebauthn/browser';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'fin-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButton,
    MatCard,
    MatCardHeader,
    MatCardContent,
    MatFormField,
    MatLabel,
    MatInput,
    MatIcon,
    MatProgressSpinnerModule,
    RouterModule,
    FormsModule,
  ],
  template: `
    <div class="gradient-background">
      <div class="wrapper">
        <div class="register-container">
          <div class="brand-section">
            <div class="logo">
              <mat-icon class="logo-icon">account_balance_wallet</mat-icon>
            </div>
            <h1 class="brand-title">Finances</h1>
          </div>

          <mat-card class="register-card">
            <mat-card-header>
              <h2>Create Account</h2>
            </mat-card-header>
            <mat-card-content>
              @if (isRegistering()) {
              <div class="loading-state">
                <mat-spinner diameter="32"></mat-spinner>
                <p>Setting up your secure passkey...</p>
                <small>This may take a moment</small>
              </div>
              } @else {
              <div class="register-form">
                <mat-form-field appearance="outline">
                  <mat-label>Full Name</mat-label>
                  <input
                    matInput
                    [(ngModel)]="name"
                    autocomplete="name"
                    required
                  />
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Username</mat-label>
                  <input
                    matInput
                    [(ngModel)]="username"
                    autocomplete="username"
                    required
                  />
                </mat-form-field>

                <div class="passkey-info">
                  <mat-icon class="security-icon">security</mat-icon>
                  <div class="security-text">
                    <h4>Passkey Security</h4>
                    <p>
                      We'll create a secure passkey using your device's
                      biometric authentication.
                    </p>
                  </div>
                </div>

                <button
                  mat-raised-button
                  color="primary"
                  (click)="registerWithPasskey()"
                  [disabled]="!name() || !username() || isRegistering()"
                  class="register-button"
                >
                  <mat-icon>fingerprint</mat-icon>
                  Create Account with Passkey
                </button>
              </div>
              }
            </mat-card-content>
          </mat-card>

          <div class="footer-links">
            <p>
              Already have an account? <a routerLink="/login">Sign in here</a>
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

    .register-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      width: 100%;
      max-width: 420px;
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
      color: var(--mat-sys-primary);
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }

    .brand-title {
      font-size: 2.5rem;
      font-weight: 300;
      margin: 0;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    .brand-subtitle {
      font-size: 1.1rem;
      margin: 8px 0 0 0;
      opacity: 0.9;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .register-card {
      width: 100%;
      backdrop-filter: blur(20px);
      border: 1px solid var(--mat-sys-outline-variant);
      box-shadow: var(--mat-sys-level2);
      border-radius: 16px;
      overflow: hidden;
    }

    .register-card mat-card-header {
      text-align: center;
      padding: 24px 24px 16px 24px;
    }

    .register-card h2 {
      font-size: 1.5rem;
      font-weight: 500;
      margin: 0;
      color: var(--mat-sys-on-surface);
    }

    .register-subtitle {
      color: var(--mat-sys-on-surface-variant);
      margin: 8px 0 0 0;
      font-size: 0.9rem;
    }

    .loading-state {
      text-align: center;
      padding: 48px 32px;
    }

    .loading-state p {
      margin: 16px 0 8px 0;
      color: var(--mat-sys-on-surface-variant);
      font-weight: 500;
    }

    .loading-state small {
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.7;
    }

    .register-form {
      padding: 16px 0;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .register-form mat-form-field {
      width: 100%;
    }

    .passkey-info {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: var(--mat-sys-surface-variant);
      border-radius: 8px;
      border-left: 4px solid var(--mat-sys-primary);
    }

    .security-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: var(--mat-sys-primary);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .security-text h4 {
      font-size: 1rem;
      font-weight: 500;
      margin: 0 0 4px 0;
      color: var(--mat-sys-on-surface);
    }

    .security-text p {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
      line-height: 1.4;
    }

    .register-button {
      gap: 8px;
      padding: 12px 24px;
      font-size: 1rem;
      border-radius: 24px;
      margin-top: 8px;
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
      .register-container {
        max-width: 100%;
        padding: 0 16px;
      }

      .brand-title {
        font-size: 2rem;
      }

      .register-card {
        margin: 0;
      }

      .passkey-info {
        flex-direction: column;
        text-align: center;
      }
    }
  `,
})
export class UserRegister {
  private _http = inject(HttpClient);
  private _router = inject(Router);

  name = signal('');
  username = signal('');
  isRegistering = signal(false);

  async registerWithPasskey() {
    if (!this.name() || !this.username()) {
      alert('Please fill in all fields');
      return;
    }

    this.isRegistering.set(true);

    try {
      // Step 1: Start registration
      const registerResponse: any = await firstValueFrom(
        this._http.post('http://localhost:8080/users/register', {
          name: this.name(),
          username: this.username(),
        })
      );

      console.log('Registration started:', registerResponse);

      // Step 2: Create passkey
      const passkeyCredential = await startRegistration(
        registerResponse.registrationOptions.options
      );

      console.log('Passkey created:', passkeyCredential);

      // Step 3: Complete registration
      const completeResponse: any = await firstValueFrom(
        this._http.post('http://localhost:8080/users/register/complete', {
          sessionId: registerResponse.sessionId,
          credential: passkeyCredential,
        })
      );

      console.log('Registration completed:', completeResponse);

      // Store tokens for future API calls
      localStorage.setItem('accessToken', completeResponse.accessToken);
      localStorage.setItem('refreshToken', completeResponse.refreshToken);

      alert('🎉 Account created successfully! You are now logged in.');

      // Redirect to main app or dashboard
      this._router.navigate(['/dashboard']);
    } catch (error: any) {
      console.error('Registration failed:', error);
    } finally {
      this.isRegistering.set(false);
    }
  }
}
