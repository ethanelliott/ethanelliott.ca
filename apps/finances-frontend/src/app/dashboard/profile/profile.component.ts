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
  styleUrl: './profile.component.scss',
  template: `
    <div class="profile-container">
      <!-- Modern Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <h1 class="page-title">
              <mat-icon fontIcon="fa-user-circle"></mat-icon>
              Profile
            </h1>
            <p class="page-subtitle">
              Manage your account settings, security, and preferences
            </p>
          </div>
          <div class="controls-section">
            <div
              class="account-status"
              [class]="userStore.isActive() ? 'active' : 'inactive'"
            >
              <mat-icon
                [fontIcon]="
                  userStore.isActive() ? 'fa-circle-check' : 'fa-circle-xmark'
                "
              ></mat-icon>
              <span>{{
                userStore.isActive() ? 'Active Account' : 'Inactive Account'
              }}</span>
            </div>
          </div>
        </div>
      </div>

      @if (userStore.loading()) {
      <div class="loading-container">
        <mat-spinner diameter="48"></mat-spinner>
        <h3>Loading Profile</h3>
        <p>Retrieving your account information...</p>
      </div>
      } @else if (userStore.user()) {

      <!-- Profile Overview Grid -->
      <div class="profile-grid">
        <!-- Profile Card -->
        <mat-card class="profile-card">
          <mat-card-header>
            <div mat-card-avatar class="profile-avatar">
              <mat-icon fontIcon="fa-user-circle"></mat-icon>
            </div>
            <mat-card-title>{{ userStore.displayName() }}</mat-card-title>
            <mat-card-subtitle>@{{ userStore.username() }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="profile-details">
              <div class="detail-row">
                <div class="detail-label">
                  <mat-icon fontIcon="fa-user"></mat-icon>
                  <span>Display Name</span>
                </div>
                <div class="detail-value">{{ userStore.displayName() }}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">
                  <mat-icon fontIcon="fa-at"></mat-icon>
                  <span>Username</span>
                </div>
                <div class="detail-value">@{{ userStore.username() }}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">
                  <mat-icon fontIcon="fa-id-badge"></mat-icon>
                  <span>User ID</span>
                </div>
                <div class="detail-value user-id">
                  {{ userStore.user()?.id }}
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Account Statistics -->
        <mat-card class="stats-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon fontIcon="fa-chart-line"></mat-icon>
              Account Statistics
            </mat-card-title>
            <mat-card-subtitle
              >Your account activity and milestones</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-icon">
                  <mat-icon fontIcon="fa-calendar-days"></mat-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Member Since</div>
                  <div class="stat-value">
                    {{ formatDate(userStore.memberSince()) }}
                  </div>
                  <div class="stat-meta">{{ getMembershipDuration() }}</div>
                </div>
              </div>
              <div class="stat-item">
                <div class="stat-icon">
                  <mat-icon fontIcon="fa-clock"></mat-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Last Active</div>
                  <div class="stat-value">
                    {{ formatDate(userStore.lastLoginAt()) || 'Never' }}
                  </div>
                  <div class="stat-meta">{{ getLastActiveTime() }}</div>
                </div>
              </div>
              <div class="stat-item">
                <div class="stat-icon">
                  <mat-icon fontIcon="fa-shield-check"></mat-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Security Level</div>
                  <div class="stat-value security-high">High</div>
                  <div class="stat-meta">Passkey Enabled</div>
                </div>
              </div>
              <div class="stat-item">
                <div class="stat-icon">
                  <mat-icon fontIcon="fa-database"></mat-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Data Privacy</div>
                  <div class="stat-value privacy-protected">Protected</div>
                  <div class="stat-meta">End-to-End Encrypted</div>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Security Section -->
      <mat-card class="security-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon fontIcon="fa-shield-halved"></mat-icon>
            Security & Authentication
          </mat-card-title>
          <mat-card-subtitle
            >Manage your account security and authentication
            methods</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <div class="security-grid">
            <div class="security-feature">
              <div class="feature-icon">
                <mat-icon fontIcon="fa-key"></mat-icon>
              </div>
              <div class="feature-content">
                <h4>Passkey Authentication</h4>
                <p>
                  Your account is secured with modern passkey authentication for
                  passwordless security
                </p>
                <div class="feature-status enabled">
                  <mat-icon fontIcon="fa-circle-check"></mat-icon>
                  <span>Enabled & Active</span>
                </div>
              </div>
            </div>
            <div class="security-feature">
              <div class="feature-icon">
                <mat-icon fontIcon="fa-lock"></mat-icon>
              </div>
              <div class="feature-content">
                <h4>Data Encryption</h4>
                <p>
                  All your financial data is encrypted at rest and in transit
                  using industry standards
                </p>
                <div class="feature-status enabled">
                  <mat-icon fontIcon="fa-circle-check"></mat-icon>
                  <span>AES-256 Encryption</span>
                </div>
              </div>
            </div>
            <div class="security-feature">
              <div class="feature-icon">
                <mat-icon fontIcon="fa-user-shield"></mat-icon>
              </div>
              <div class="feature-content">
                <h4>Privacy Controls</h4>
                <p>
                  You have full control over your data with granular privacy
                  settings
                </p>
                <div class="feature-status enabled">
                  <mat-icon fontIcon="fa-circle-check"></mat-icon>
                  <span>Full Control</span>
                </div>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Actions Section -->
      <div class="actions-grid">
        <mat-card class="action-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon fontIcon="fa-right-from-bracket"></mat-icon>
              Session Management
            </mat-card-title>
            <mat-card-subtitle>Manage your current session</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="action-content">
              <p>
                Sign out of your account on this device. You'll need to
                authenticate again to access your data.
              </p>
              <button
                mat-raised-button
                color="accent"
                (click)="logout()"
                class="logout-button"
              >
                <mat-icon fontIcon="fa-right-from-bracket"></mat-icon>
                Sign Out
              </button>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Danger Zone -->
        <mat-card class="danger-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon fontIcon="fa-triangle-exclamation"></mat-icon>
              Danger Zone
            </mat-card-title>
            <mat-card-subtitle
              >Irreversible and destructive actions</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            <div class="danger-content">
              <div class="danger-warning">
                <mat-icon fontIcon="fa-exclamation-triangle"></mat-icon>
                <div class="warning-text">
                  <h4>Delete Account</h4>
                  <p>
                    Permanently delete your account and all associated data.
                    This action cannot be undone and will immediately remove all
                    your financial records, categories, and settings.
                  </p>
                </div>
              </div>
              <button
                mat-flat-button
                (click)="deleteAccount()"
                [disabled]="userStore.deleting()"
                class="delete-button"
              >
                @if (userStore.deleting()) {
                <mat-spinner diameter="20"></mat-spinner>
                Deleting Account... } @else {
                <ng-container>
                  <mat-icon fontIcon="fa-trash"></mat-icon>
                  Delete Account
                </ng-container>
                }
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
      }
    </div>
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

  getMembershipDuration(): string {
    const memberSince = this.userStore.memberSince();
    if (!memberSince) return '';

    const start = new Date(memberSince);
    const now = new Date();
    const diffInMs = now.getTime() - start.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays < 30) {
      return `${diffInDays} day${diffInDays === 1 ? '' : 's'}`;
    } else if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return `${months} month${months === 1 ? '' : 's'}`;
    } else {
      const years = Math.floor(diffInDays / 365);
      const remainingMonths = Math.floor((diffInDays % 365) / 30);
      if (remainingMonths === 0) {
        return `${years} year${years === 1 ? '' : 's'}`;
      }
      return `${years}y ${remainingMonths}m`;
    }
  }

  getLastActiveTime(): string {
    const lastLogin = this.userStore.lastLoginAt();
    if (!lastLogin) return 'First visit';

    const last = new Date(lastLogin);
    const now = new Date();
    const diffInMs = now.getTime() - last.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} min${diffInMinutes === 1 ? '' : 's'} ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
    } else if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
    } else {
      return this.formatDate(lastLogin);
    }
  }
}
