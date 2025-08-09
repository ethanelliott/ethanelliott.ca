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
import { fido2Get } from '@ownid/webauthn';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'fin-login',
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
      <mat-card-header><h1>Login with Passkey</h1></mat-card-header>
      <mat-card-content>
        <p>Secure, passwordless login using your passkey!</p>
        <mat-form-field appearance="outline">
          <mat-label>Username (optional)</mat-label>
          <input
            matInput
            [(ngModel)]="username"
            placeholder="Leave empty for device passkey"
          />
        </mat-form-field>
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-flat-button
          (click)="loginWithPasskey()"
          [disabled]="isLoggingIn()"
        >
          {{ isLoggingIn() ? 'Authenticating...' : 'Login with Passkey' }}
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
export class UserLogin {
  private _http = inject(HttpClient);

  username = signal('');
  isLoggingIn = signal(false);

  async loginWithPasskey() {
    this.isLoggingIn.set(true);

    try {
      // Step 1: Start passkey authentication
      const authResponse: any = await firstValueFrom(
        this._http.post('http://localhost:8080/users/passkey/login/start', {
          username: this.username() || undefined,
        })
      );

      console.log('Authentication started:', authResponse);

      // Step 2: Get passkey assertion
      const passkeyAssertion = await fido2Get(
        authResponse.options,
        this.username()
      );

      console.log('Passkey assertion:', passkeyAssertion);

      // Step 3: Complete authentication
      const completeResponse: any = await firstValueFrom(
        this._http.post('http://localhost:8080/users/passkey/login/complete', {
          sessionId: authResponse.sessionId,
          credential: passkeyAssertion,
        })
      );

      console.log('Authentication completed:', completeResponse);
      alert('🚀 Welcome back! Logged in successfully.');

      // Redirect to main app or dashboard
      window.location.href = '/';
    } catch (error: any) {
      console.error('Login failed:', error);
      alert(
        'Login failed: ' +
          (error?.error?.message || error?.message || 'Unknown error')
      );
    } finally {
      this.isLoggingIn.set(false);
    }
  }
}
