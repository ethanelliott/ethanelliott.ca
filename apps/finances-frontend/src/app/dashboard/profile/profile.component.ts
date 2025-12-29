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
import { DialogService } from '../../shared/dialogs';

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
  template: ` <div class="profile-container"></div> `,
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

  deleteAllTransactions() {
    this.dialogService
      .confirmDangerous(
        'This will permanently delete ALL your transactions. This action cannot be undone and will remove all your transaction history.',
        'DELETE ALL',
        'Delete All Transactions',
        'Delete All Transactions',
        'Cancel'
      )
      .subscribe((confirmed) => {
        if (confirmed) {
          this.userStore.deleteAllTransactions();
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
