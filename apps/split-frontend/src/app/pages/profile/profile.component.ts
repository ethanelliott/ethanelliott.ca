import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Avatar } from 'primeng/avatar';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth.service';
import { UpdateService } from '../../core/update.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, Button, InputText, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="profile-head card">
        <p-avatar
          [label]="initial()"
          size="xlarge"
          shape="circle"
          styleClass="profile-avatar"
        />
        <h1>{{ auth.profile()?.name }}</h1>
        <span class="username">{{ '@' + (auth.profile()?.username || '') }}</span>
      </div>

      <h2 class="section-title">Account details</h2>
      <div class="card form-card">
        <div class="field">
          <label>Display name</label>
          <input pInputText [(ngModel)]="name" />
        </div>
        <div class="field">
          <label>Email</label>
          <input pInputText type="email" [(ngModel)]="email" placeholder="optional" />
        </div>
        <p-button
          label="Save changes"
          [loading]="saving()"
          (onClick)="save()"
        />
      </div>

      <h2 class="section-title">Security</h2>
      <div class="card info-card">
        <div class="info-row">
          <i class="pi pi-key"></i>
          <span>Signed in with a passkey on this device.</span>
        </div>
      </div>

      <h2 class="section-title">App</h2>
      <div class="card info-card">
        <button class="update-row" (click)="checkUpdates()">
          <i class="pi pi-sync" [class.spin]="update.checking()"></i>
          <span>
            @if (update.updateReady()) {
              Update ready — tap to apply
            } @else {
              {{ update.checking() ? 'Checking…' : checkLabel() }}
            }
          </span>
        </button>
      </div>

      <div class="logout-wrap">
        <p-button
          label="Log out"
          severity="danger"
          [outlined]="true"
          icon="pi pi-sign-out"
          styleClass="w-full"
          (onClick)="logout()"
        />
      </div>
    </div>
  `,
  styles: `
    // Settings-style page reads better narrow, even on a wide canvas.
    .page {
      max-width: 560px;
    }

    .profile-head {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 28px 16px;
      margin-bottom: 8px;
      h1 {
        font-size: 20px;
      }
      .username {
        color: var(--text-secondary);
      }
    }
    ::ng-deep .profile-avatar {
      background: var(--brand-light) !important;
      color: var(--brand) !important;
      width: 76px !important;
      height: 76px !important;
      font-size: 30px !important;
      font-weight: 700;
    }
    .form-card,
    .info-card {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      label {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary);
      }
      input {
        width: 100%;
      }
    }
    .info-row {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-secondary);
      i {
        color: var(--brand);
      }
    }
    .update-row {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      border: none;
      background: transparent;
      cursor: pointer;
      padding: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      text-align: left;
      i {
        color: var(--brand);
      }
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .spin {
      animation: spin 0.9s linear infinite;
    }
    .logout-wrap {
      margin-top: 24px;
    }
    :host ::ng-deep .w-full {
      width: 100%;
    }
  `,
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  readonly update = inject(UpdateService);
  private readonly messages = inject(MessageService);

  name = '';
  email = '';
  readonly saving = signal(false);
  readonly checkLabel = signal('Check for updates');

  constructor() {
    const apply = () => {
      const p = this.auth.profile();
      if (p) {
        this.name = p.name;
        this.email = p.email ?? '';
      }
    };
    if (this.auth.profile()) {
      apply();
    } else {
      void this.auth.loadProfile().then(apply);
    }
  }

  initial(): string {
    return (this.auth.profile()?.name?.charAt(0) || '?').toUpperCase();
  }

  async checkUpdates(): Promise<void> {
    if (this.update.updateReady()) {
      await this.update.apply();
      return;
    }
    const found = await this.update.check();
    if (!found) {
      this.checkLabel.set('Up to date');
      setTimeout(() => this.checkLabel.set('Check for updates'), 2500);
    }
  }

  save(): void {
    this.saving.set(true);
    this.auth
      .updateProfile({ name: this.name.trim(), email: this.email.trim() || undefined })
      .then(() => {
        this.messages.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Your profile has been updated.',
        });
      })
      .catch(() => {
        this.messages.add({
          severity: 'error',
          summary: 'Could not save',
          detail: 'Please try again.',
        });
      })
      .finally(() => this.saving.set(false));
  }

  logout(): void {
    void this.auth.logout();
  }
}
