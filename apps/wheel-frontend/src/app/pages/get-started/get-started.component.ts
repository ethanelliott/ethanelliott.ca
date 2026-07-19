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
  selector: 'app-get-started',
  standalone: true,
  imports: [FormsModule, RouterLink, Button, InputText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-screen">
      <div class="auth-card card">
        <div class="logo"><i class="pi pi-bullseye"></i></div>
        <h1>Create a wheel space</h1>
        <p class="subtitle">
          No password — just a passkey. You'll get a unique username so
          friends can share wheels with you, and you can change it anytime.
        </p>

        <div class="field">
          <label for="name">Display name <span>(optional)</span></label>
          <input
            pInputText
            id="name"
            [(ngModel)]="name"
            placeholder="e.g. Date night picks"
            (keyup.enter)="register()"
          />
        </div>

        <p-button
          [loading]="loading()"
          (onClick)="register()"
          styleClass="w-full"
          label="Create & add passkey"
          icon="pi pi-shield"
        />

        <div class="divider"><span>already have a passkey?</span></div>
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
      background: linear-gradient(160deg, #11998e 0%, #0a5f56 100%);
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
        span {
          font-weight: 400;
          color: var(--text-muted);
        }
      }
      input {
        width: 100%;
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
export class GetStartedComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  name = '';
  readonly loading = signal(false);

  async register(): Promise<void> {
    this.loading.set(true);
    try {
      const name = this.name.trim();
      await this.auth.register(name ? { name } : undefined);
      await this.router.navigate(['/wheels']);
    } catch (error: any) {
      this.messages.add({
        severity: 'error',
        summary: 'Could not create your space',
        detail:
          error?.error?.message ||
          error?.message ||
          'Passkey registration failed. Please try again.',
      });
    } finally {
      this.loading.set(false);
    }
  }
}
