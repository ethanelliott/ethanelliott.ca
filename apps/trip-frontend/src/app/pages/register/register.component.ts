import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink, Button, InputText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-screen">
      <div class="auth-card card">
        <div class="logo"><i class="pi pi-user-plus"></i></div>
        <h1>Choose a username</h1>
        <p class="subtitle">
          That's it — secure your account with a passkey. You can add a display
          name later.
        </p>

        <div class="field">
          <label for="username">Username</label>
          <input
            pInputText
            id="username"
            [(ngModel)]="username"
            autocapitalize="none"
            autocomplete="username"
            (keyup.enter)="register()"
          />
          <small>Letters, numbers and underscores. Min 3 characters.</small>
        </div>

        <p-button
          [loading]="loading()"
          (onClick)="register()"
          styleClass="w-full"
          label="Create account & add passkey"
          icon="pi pi-shield"
        />

        <div class="divider"><span>already have an account?</span></div>
        <a routerLink="/login" class="signin-link">Sign in instead</a>
      </div>
    </div>
  `,
  styles: `
    .auth-screen {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: linear-gradient(160deg, var(--brand) 0%, #312e81 100%);
    }
    .auth-card {
      width: 100%;
      max-width: 400px;
      padding: 32px 24px;
      text-align: center;
    }
    .logo {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: var(--brand-light);
      color: var(--brand);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      i {
        font-size: 30px;
      }
    }
    h1 {
      font-size: 22px;
      margin-bottom: 6px;
    }
    .subtitle {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 22px;
    }
    .field {
      text-align: left;
      margin-bottom: 16px;
      label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
        color: var(--text-secondary);
      }
      input {
        width: 100%;
      }
      small {
        display: block;
        margin-top: 4px;
        color: var(--text-muted);
        font-size: 12px;
      }
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 22px 0 14px;
      color: var(--text-muted);
      font-size: 12px;
      &::before,
      &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border);
      }
    }
    .signin-link {
      font-weight: 600;
    }
    :host ::ng-deep .w-full {
      width: 100%;
    }
  `,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  username = '';
  readonly loading = signal(false);

  async register(): Promise<void> {
    const username = this.username.trim();
    if (username.length < 3) {
      this.messages.add({
        severity: 'warn',
        summary: 'Username too short',
        detail: 'Pick a username of at least 3 characters.',
      });
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.register({ username });
      await this.router.navigate(['/trips']);
    } catch (error: any) {
      this.messages.add({
        severity: 'error',
        summary: 'Could not create account',
        detail:
          error?.error?.message ||
          error?.message ||
          'Registration failed. The username may already be taken.',
      });
    } finally {
      this.loading.set(false);
    }
  }
}
