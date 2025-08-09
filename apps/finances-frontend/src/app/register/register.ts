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
import {
  MatCard,
  MatCardActions,
  MatCardContent,
  MatCardHeader,
} from '@angular/material/card';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { startRegistration } from '@simplewebauthn/browser';
import { Router } from '@angular/router';

@Component({
  selector: 'fin-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButton,
    MatCard,
    MatCardHeader,
    MatCardActions,
    MatCardContent,
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
  ],
  template: `<div class="wrapper">
    <mat-card class="container">
      <mat-card-header><h1>Register with Passkey</h1></mat-card-header>
      <mat-card-content>
        <p>Create your account with maximum security using passkeys!</p>
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput [(ngModel)]="name" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Username</mat-label>
          <input matInput [(ngModel)]="username" />
        </mat-form-field>
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-flat-button
          (click)="registerWithPasskey()"
          [disabled]="isRegistering()"
        >
          {{
            isRegistering()
              ? 'Setting up your passkey...'
              : 'Register with Passkey'
          }}
        </button>
      </mat-card-actions>
    </mat-card>
  </div>`,
  styles: `
    .wrapper {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    align-items: center;
    justify-content: center;
  }
  
  .container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
    min-width: 400px;
    width: 30vw;
  }

  mat-form-field {
    width: 100%;
  }

  mat-card-actions {
    display: flex;
    flex-direction: row-reverse;
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
      alert('🎉 Account created successfully! You are now logged in.');

      // Redirect to main app or dashboard
      // this._router.navigate(['/']);
    } catch (error: any) {
      console.error('Registration failed:', error);
      alert(
        'Registration failed: ' +
          (error?.error?.message || error?.message || 'Unknown error')
      );
    } finally {
      this.isRegistering.set(false);
    }
  }
}
