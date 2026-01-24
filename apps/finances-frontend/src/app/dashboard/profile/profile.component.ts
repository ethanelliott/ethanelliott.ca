import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  effect,
} from '@angular/core';

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
import { DialogService } from '../../shared/dialogs';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
      <!-- Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <p class="page-subtitle">
              Manage your account settings and preferences
            </p>
          </div>
          <div class="controls-section">
            <div class="account-status active">
              <mat-icon>verified_user</mat-icon>
              <span>Active Member</span>
            </div>
          </div>
        </div>
      </div>

      @if (userStore.loading()) {
      <div class="loading-container">
        <mat-spinner diameter="48"></mat-spinner>
        <h3>Loading Profile...</h3>
      </div>
      } @else {
      <div class="profile-grid">
        <!-- Profile Card -->
        <mat-card class="profile-card">
          <mat-card-header>
            <div class="profile-avatar">
              {{ userStore.user()?.name?.charAt(0)?.toUpperCase() || 'U' }}
            </div>
            <mat-card-title>{{ userStore.user()?.name }}</mat-card-title>
            <mat-card-subtitle>{{
              userStore.user()?.username
            }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <form [formGroup]="profileForm" (ngSubmit)="updateProfile()">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Display Name</mat-label>
                <input
                  matInput
                  formControlName="name"
                  placeholder="Enter your name"
                />
                <mat-icon matSuffix>badge</mat-icon>
                @if (profileForm.get('name')?.hasError('required')) {
                <mat-error>Name is required</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Username</mat-label>
                <input matInput formControlName="username" [readonly]="true" />
                <mat-icon matSuffix>alternate_email</mat-icon>
                <mat-hint>Username cannot be changed</mat-hint>
              </mat-form-field>

              <div class="form-actions">
                <button
                  mat-button
                  type="button"
                  (click)="resetForm()"
                  [disabled]="!hasFormChanges()"
                >
                  Reset
                </button>
                <button
                  mat-raised-button
                  color="primary"
                  type="submit"
                  [disabled]="!profileForm.valid || !hasFormChanges()"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>

        <!-- Stats & Actions -->
        <div class="stats-column">
          <!-- Membership Stats -->
          <mat-card class="stats-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>analytics</mat-icon>
                Account Statistics
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <mat-list>
                <mat-list-item>
                  <mat-icon matListItemIcon>calendar_today</mat-icon>
                  <div matListItemTitle>Member Since</div>
                  <div matListItemLine>
                    {{ formatDate(userStore.memberSince()) }}
                  </div>
                  <div matListItemMeta>{{ getMembershipDuration() }}</div>
                </mat-list-item>
                <mat-divider></mat-divider>
                <mat-list-item>
                  <mat-icon matListItemIcon>schedule</mat-icon>
                  <div matListItemTitle>Last Active</div>
                  <div matListItemLine>{{ getLastActiveTime() }}</div>
                </mat-list-item>
              </mat-list>
            </mat-card-content>
          </mat-card>

          <!-- Danger Zone -->
          <mat-card class="danger-zone">
            <mat-card-header>
              <mat-card-title class="text-danger">
                <mat-icon color="warn">warning</mat-icon>
                Danger Zone
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <p class="warning-text">
                These actions are irreversible. Please be certain.
              </p>

              <div class="danger-actions">
                <button
                  mat-stroked-button
                  color="warn"
                  (click)="logout()"
                  class="action-button"
                >
                  <mat-icon>logout</mat-icon>
                  Sign Out
                </button>

                <button
                  mat-flat-button
                  color="warn"
                  (click)="deleteAccount()"
                  class="action-button"
                >
                  <mat-icon>no_accounts</mat-icon>
                  Delete Account
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        </div>
      </div>
      }
    </div>
  `,
})
export class ProfileComponent implements OnInit {
  protected readonly userStore = injectUserStore();
  private readonly fb = inject(FormBuilder);
  private readonly dialogService = inject(DialogService);

  profileForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    username: [''],
  });

  ngOnInit(): void {
    this.userStore.loadProfile();
  }

  constructor() {
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
    this.dialogService
      .confirmDangerous(
        'This will permanently delete your account and all data. This action cannot be undone.',
        'DELETE',
        'Delete Account',
        'Delete Account',
        'Cancel'
      )
      .subscribe((confirmed) => {
        if (confirmed) {
          this.userStore.deleteAccount();
        }
      });
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
