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
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { startRegistration } from '@simplewebauthn/browser';
import { Router, RouterModule } from '@angular/router';
import { DialogService } from '../shared/dialogs';

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButton,
    MatCard,
    MatCardContent,
    MatFormField,
    MatLabel,
    MatInput,
    MatIcon,
    MatProgressSpinnerModule,
    RouterModule,
    FormsModule,
  ],
  styleUrl: './register.component.scss',
  template: `
    <div class="gradient-background">
      <div class="wrapper">
        <div class="register-container">
          <div class="header-section">
            <div class="brand-badge">
              <mat-icon>account_balance_wallet</mat-icon>
              <span>Finances</span>
            </div>
            <h1 class="page-title">
              Start Your<br />
              <span class="highlight">Journey.</span>
            </h1>
          </div>

          <mat-card class="register-card">
            <mat-card-content>
              <div class="register-content">
                @if (isRegistering()) {
                <div class="loading-state">
                  <mat-spinner diameter="48" strokeWidth="4"></mat-spinner>
                  <p>Creating your account...</p>
                  <small>This may take a moment</small>
                </div>
                } @else {
                <div class="register-form">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Full Name</mat-label>
                    <input
                      matInput
                      [(ngModel)]="name"
                      autocomplete="name"
                      required
                      placeholder="John Doe"
                    />
                    <mat-icon matSuffix>person</mat-icon>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Username</mat-label>
                    <input
                      matInput
                      [(ngModel)]="username"
                      autocomplete="username"
                      required
                      placeholder="johndoe"
                    />
                    <mat-icon matSuffix>alternate_email</mat-icon>
                  </mat-form-field>

                  <button
                    mat-flat-button
                    color="primary"
                    (click)="registerWithPasskey()"
                    [disabled]="!name() || !username() || isRegistering()"
                    class="register-button"
                  >
                    Create Account
                    <mat-icon iconPosition="end">arrow_forward</mat-icon>
                  </button>
                </div>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <div class="footer-links">
            <p>Already have an account? <a routerLink="/login">Sign in</a></p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class UserRegister {
  private _http = inject(HttpClient);
  private _router = inject(Router);
  private _dialogService = inject(DialogService);

  name = signal('');
  username = signal('');
  isRegistering = signal(false);

  async registerWithPasskey() {
    if (!this.name() || !this.username()) {
      this._dialogService.error(
        'Please fill in all fields',
        'Missing Information'
      );
      return;
    }

    this.isRegistering.set(true);

    try {
      // Step 1: Start registration
      const registerResponse: any = await firstValueFrom(
        this._http.post(
          'https://finances-service.elliott.haus/users/register',
          {
            name: this.name(),
            username: this.username(),
          }
        )
      );

      console.log('Registration started:', registerResponse);

      // Step 2: Create passkey
      const passkeyCredential = await startRegistration(
        registerResponse.registrationOptions.options
      );

      console.log('Passkey created:', passkeyCredential);

      // Step 3: Complete registration
      const completeResponse: any = await firstValueFrom(
        this._http.post(
          'https://finances-service.elliott.haus/users/register/complete',
          {
            sessionId: registerResponse.sessionId,
            credential: passkeyCredential,
          }
        )
      );

      console.log('Registration completed:', completeResponse);

      // Store tokens for future API calls
      localStorage.setItem('accessToken', completeResponse.accessToken);
      localStorage.setItem('refreshToken', completeResponse.refreshToken);

      this._dialogService.success(
        '🎉 Account created successfully! You are now logged in.',
        'Welcome!'
      );

      // Redirect to main app or dashboard
      this._router.navigate(['/dashboard']);
    } catch (error: any) {
      console.error('Registration failed:', error);
    } finally {
      this.isRegistering.set(false);
    }
  }
}
