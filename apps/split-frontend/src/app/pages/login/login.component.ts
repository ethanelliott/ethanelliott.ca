import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-screen">
      <div class="auth-card card">
        <div class="logo">
          <i class="pi pi-wallet"></i>
        </div>
        <h1>Welcome back</h1>
        <p class="subtitle">Sign in with your passkey.</p>

        <p-button
          [loading]="loading()"
          (onClick)="login()"
          styleClass="w-full"
          label="Sign in with passkey"
          icon="pi pi-key"
        />

        <div class="divider"><span>new here?</span></div>

        <a routerLink="/register" class="create-account"> Create an account </a>
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
      background: linear-gradient(160deg, var(--brand) 0%, #0f5d46 100%);
    }

    .auth-card {
      width: 100%;
      max-width: 380px;
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

    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 22px 0 14px;
      color: var(--text-muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      &::before,
      &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border);
      }
    }

    .create-account {
      font-weight: 600;
    }

    :host ::ng-deep .w-full {
      width: 100%;
    }
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  readonly loading = signal(false);

  async login(): Promise<void> {
    this.loading.set(true);
    try {
      await this.auth.loginWithPasskey();
      await this.router.navigate(['/groups']);
    } catch (error: any) {
      this.messages.add({
        severity: 'error',
        summary: 'Login failed',
        detail:
          error?.error?.message ||
          error?.message ||
          'Could not authenticate with a passkey.',
      });
    } finally {
      this.loading.set(false);
    }
  }
}
