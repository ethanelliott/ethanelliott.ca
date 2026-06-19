import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, Button, InputText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1 class="title">Account</h1>

      @if (auth.profile(); as profile) {
        <div class="card profile-card">
          <div class="field">
            <label>Username</label>
            <input pInputText [value]="profile.username" disabled />
          </div>

          <div class="field">
            <label for="name">Display name</label>
            <input pInputText id="name" [(ngModel)]="name" />
          </div>

          <div class="field">
            <label for="email">Email</label>
            <input
              pInputText
              id="email"
              type="email"
              [(ngModel)]="email"
              autocapitalize="none"
            />
          </div>

          <p-button
            [loading]="saving()"
            (onClick)="save()"
            label="Save changes"
            icon="pi pi-check"
          />
        </div>
      } @else {
        <div class="empty-state">
          <i class="pi pi-user"></i>
          Loading your profile…
        </div>
      }

      <div class="logout-row">
        <p-button
          severity="secondary"
          [text]="true"
          (onClick)="logout()"
          label="Log out"
          icon="pi pi-sign-out"
        />
      </div>
    </div>
  `,
  styles: `
    .title {
      font-size: 22px;
      margin-bottom: 16px;
    }
    .profile-card {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 460px;
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
    .logout-row {
      margin-top: 18px;
    }
  `,
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  name = '';
  email = '';
  readonly saving = signal(false);

  constructor() {
    // Seed the form once the profile resolves.
    void this.auth.loadProfile().then((profile) => {
      if (profile) {
        this.name = profile.name ?? '';
        this.email = profile.email ?? '';
      }
    });
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.auth.updateProfile({
        name: this.name.trim() || undefined,
        email: this.email.trim() || undefined,
      });
      this.messages.add({
        severity: 'success',
        summary: 'Saved',
        detail: 'Your profile has been updated.',
      });
    } catch (error: any) {
      this.messages.add({
        severity: 'error',
        summary: 'Could not save',
        detail: error?.error?.message || error?.message || 'Please try again.',
      });
    } finally {
      this.saving.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
