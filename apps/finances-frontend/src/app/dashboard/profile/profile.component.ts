import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { injectUserStore } from '../../store';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatListModule,
  ],
  template: `
    <div class="profile-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h1 class="page-title">Profile</h1>
          <p class="page-subtitle">
            Manage your account settings and preferences
          </p>
        </div>
      </div>

      @if (userStore.loading()) {
      <div class="loading-container">
        <mat-spinner></mat-spinner>
        <p>Loading profile...</p>
      </div>
      } @else if (userStore.user()) {
      <!-- Profile Info Card -->
      <mat-card class="profile-info-card">
        <mat-card-header>
          <div mat-card-avatar class="profile-avatar">
            <mat-icon>account_circle</mat-icon>
          </div>
          <mat-card-title>{{ userStore.displayName() }}</mat-card-title>
          <mat-card-subtitle>@{{ userStore.username() }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="profile-stats">
            <div class="stat-item">
              <mat-icon>event</mat-icon>
              <div class="stat-info">
                <span class="stat-label">Member Since</span>
                <span class="stat-value">{{
                  formatDate(userStore.memberSince())
                }}</span>
              </div>
            </div>
            <div class="stat-item">
              <mat-icon>login</mat-icon>
              <div class="stat-info">
                <span class="stat-label">Last Login</span>
                <span class="stat-value">{{
                  formatDate(userStore.lastLoginAt()) || 'Never'
                }}</span>
              </div>
            </div>
            <div class="stat-item">
              <mat-icon>verified</mat-icon>
              <div class="stat-info">
                <span class="stat-label">Account Status</span>
                <span
                  class="stat-value"
                  [class]="userStore.isActive() ? 'active' : 'inactive'"
                >
                  {{ userStore.isActive() ? 'Active' : 'Inactive' }}
                </span>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Security Card -->
      <mat-card class="security-card">
        <mat-card-header>
          <mat-card-title>Security</mat-card-title>
          <mat-card-subtitle>Manage your account security</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="security-section">
            <div class="security-item">
              <div class="security-info">
                <mat-icon>security</mat-icon>
                <div class="security-text">
                  <h4>Passkey Authentication</h4>
                  <p>
                    Your account is secured with passkey authentication for
                    maximum security
                  </p>
                </div>
              </div>
              <mat-icon class="security-status">check_circle</mat-icon>
            </div>

            <mat-divider></mat-divider>

            <div class="security-actions">
              <button
                mat-raised-button
                color="accent"
                (click)="logout()"
                class="logout-button"
              >
                <mat-icon>logout</mat-icon>
                Sign Out
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Danger Zone -->
      <mat-card class="danger-card">
        <mat-card-header>
          <mat-card-title class="danger-title">Danger Zone</mat-card-title>
          <mat-card-subtitle
            >Irreversible and destructive actions</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <mat-list-item>
            <h4 matListItemTitle>Delete Account</h4>
            <p matListItemLine>
              Permanently delete your account and all associated data. This
              action cannot be undone.
            </p>
            <div matListItemMeta>
              <button
                mat-flat-button
                (click)="deleteAccount()"
                [disabled]="userStore.deleting()"
                class="delete-button"
              >
                @if (userStore.deleting()) {
                <mat-spinner diameter="20"></mat-spinner>
                Deleting... } @else {
                <ng-container>
                  <mat-icon>delete_forever</mat-icon>
                  Delete Account
                </ng-container>
                }
              </button>
            </div>
          </mat-list-item>
        </mat-card-content>
      </mat-card>
      }
    </div>
  `,
  styles: `
    .profile-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 16px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      font-size: 2rem;
      font-weight: 400;
      margin: 0;
      color: var(--mat-sys-primary);
    }

    .page-subtitle {
      color: var(--mat-sys-on-surface-variant);
      margin: 4px 0 0 0;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
    }

    .profile-info-card {
      margin-bottom: 24px;
    }

    .profile-avatar {
      background: var(--mat-sys-primary);
      color: var(--mat-on-primary-color);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .profile-avatar mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .profile-stats {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 16px;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .stat-item mat-icon {
      color: var(--mat-sys-primary);
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-label {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .stat-value {
      font-weight: 500;
    }

    .stat-value.active {
      color: var(--mat-success-color, #4caf50);
    }

    .stat-value.inactive {
      color: var(--mat-error-color, #f44336);
    }

    .edit-profile-card {
      margin-bottom: 24px;
    }

    .profile-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-actions {
      display: flex;
      gap: 16px;
      justify-content: flex-end;
      margin-top: 16px;
    }

    .save-button {
      gap: 8px;
    }

    .security-card {
      margin-bottom: 24px;
    }

    .security-section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .security-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
    }

    .security-info {
      display: flex;
      align-items: center;
      gap: 16px;
      flex: 1;
    }

    .security-info mat-icon {
      color: var(--mat-sys-primary);
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .security-text h4 {
      margin: 0 0 4px 0;
      font-size: 1rem;
      font-weight: 500;
    }

    .security-text p {
      margin: 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .security-status {
      color: var(--mat-success-color, #4caf50);
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .security-actions {
      padding: 16px 0;
    }

    .logout-button {
      gap: 8px;
    }

    .danger-card {
      margin-bottom: 24px;
      border: 1px solid var(--mat-error-color);
    }

    .danger-title {
      color: var(--mat-error-color);
    }

    .danger-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .danger-info h4 {
      margin: 0 0 4px 0;
      font-size: 1rem;
      font-weight: 500;
      color: var(--mat-error-color);
    }

    .danger-info p {
      margin: 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .delete-button {
      gap: 8px;
      margin-left: 16px;
    }

    @media (max-width: 768px) {
      .form-actions {
        flex-direction: column;
      }

      .danger-section {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }

      .delete-button {
        margin-left: 0;
        align-self: flex-end;
      }

      .profile-stats {
        gap: 12px;
      }

      .stat-item {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
    }
  `,
})
export class ProfileComponent {
  protected readonly userStore = injectUserStore();
  private readonly fb = inject(FormBuilder);

  profileForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    username: [''],
  });

  constructor() {
    this.userStore.loadProfile();

    // Update form when user data changes
    effect(() => {
      const user = this.userStore.user();
      if (user) {
        this.profileForm.patchValue(
          {
            name: user.name,
            username: user.username,
          },
          { emitEvent: false }
        ); // Prevent triggering valueChanges
      }
    });
  }

  updateProfile() {
    if (!this.profileForm.valid || !this.hasFormChanges()) return;

    const updates = {
      name: this.profileForm.value.name.trim(),
    };

    this.userStore.updateProfile(updates);
  }

  hasFormChanges(): boolean {
    const currentName = this.profileForm.value.name;
    const originalName = this.userStore.user()?.name;
    return currentName !== originalName;
  }

  resetForm() {
    const user = this.userStore.user();
    if (user) {
      this.profileForm.patchValue({
        name: user.name,
        username: user.username,
      });
    }
  }

  logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    this.userStore.logout(refreshToken || undefined);
  }

  deleteAccount() {
    const confirmation = prompt(
      'This will permanently delete your account and all data. Type "DELETE" to confirm:'
    );

    if (confirmation !== 'DELETE') {
      return;
    }

    this.userStore.deleteAccount();
  }

  formatDate(date: Date | string | null): string {
    if (!date) return 'Never';
    return new Intl.DateTimeFormat('en-CA', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  }
}
