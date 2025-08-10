import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
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
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { FinanceApiService } from '../../services/finance-api.service';

@Component({
  selector: 'app-mediums',
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
    MatListModule,
    MatDividerModule,
  ],
  template: `
    <div class="mediums-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h1 class="page-title">Payment Methods</h1>
          <p class="page-subtitle">Manage how you pay for transactions</p>
        </div>
      </div>

      <!-- Add Medium Form -->
      <mat-card class="add-medium-card">
        <mat-card-header>
          <mat-card-title>Add New Payment Method</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="mediumForm" class="medium-form">
            <mat-form-field appearance="outline" class="medium-name-field">
              <mat-label>Payment Method Name</mat-label>
              <input
                matInput
                formControlName="name"
                required
                placeholder="e.g., Credit Card, Cash, Debit Card"
              />
            </mat-form-field>
            <button
              mat-raised-button
              color="primary"
              (click)="addMedium()"
              [disabled]="!mediumForm.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
              Add Method } @else {
              <ng-container>
                <mat-icon>add</mat-icon>
                Add Method
              </ng-container>
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Mediums List -->
      <mat-card class="mediums-list-card">
        <mat-card-header>
          <mat-card-title>All Payment Methods</mat-card-title>
          <mat-card-subtitle
            >{{ mediums().length }} payment methods available</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <p>Loading payment methods...</p>
          </div>
          } @else if (mediums().length === 0) {
          <div class="empty-state">
            <mat-icon>payment</mat-icon>
            <h3>No payment methods yet</h3>
            <p>
              Add your first payment method above to start tracking transaction
              methods
            </p>
          </div>
          } @else {
          <mat-list class="mediums-list">
            @for (medium of mediums(); track medium) {
            <mat-list-item class="medium-item">
              <div matListItemTitle class="medium-info">
                <mat-icon matListItemIcon class="medium-icon">{{
                  getMediumIcon(medium)
                }}</mat-icon>
                <span class="medium-name">{{ medium }}</span>
              </div>
              <div class="medium-actions">
                <button
                  mat-icon-button
                  (click)="deleteMedium(medium)"
                  class="delete-button"
                  [disabled]="deleting().has(medium)"
                >
                  @if (deleting().has(medium)) {
                  <mat-spinner diameter="16"></mat-spinner>
                  } @else {
                  <mat-icon>delete</mat-icon>
                  }
                </button>
              </div>
            </mat-list-item>
            <mat-divider></mat-divider>
            }
          </mat-list>
          }
        </mat-card-content>
      </mat-card>

      <!-- Quick Add Suggestions -->
      <mat-card class="suggestions-card">
        <mat-card-header>
          <mat-card-title>Common Payment Methods</mat-card-title>
          <mat-card-subtitle
            >Click to quickly add popular payment methods</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <div class="suggestions-grid">
            @for (suggestion of commonMediums; track suggestion) {
            <button
              mat-stroked-button
              (click)="addSuggestedMedium(suggestion)"
              [disabled]="mediums().includes(suggestion) || submitting()"
              class="suggestion-chip"
            >
              <mat-icon>{{ getMediumIcon(suggestion) }}</mat-icon>
              {{ suggestion }}
            </button>
            }
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .mediums-container {
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
      color: var(--mat-primary-color);
    }

    .page-subtitle {
      color: var(--mat-secondary-text-color);
      margin: 4px 0 0 0;
    }

    .add-medium-card {
      margin-bottom: 24px;
      border: 2px solid var(--mat-primary-color);
    }

    .medium-form {
      display: flex;
      gap: 16px;
      align-items: flex-end;
    }

    .medium-name-field {
      flex: 1;
    }

    .add-button {
      gap: 8px;
      min-width: 140px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      gap: 16px;
    }

    .empty-state {
      text-align: center;
      padding: 64px 32px;
      color: var(--mat-secondary-text-color);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state h3 {
      margin: 16px 0 8px 0;
      color: var(--mat-primary-text-color);
    }

    .mediums-list {
      padding: 0;
    }

    .medium-item {
      padding: 16px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .medium-info {
      display: flex;
      align-items: center;
      gap: 16px;
      flex: 1;
    }

    .medium-icon {
      color: var(--mat-primary-color);
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .medium-name {
      font-size: 1.1rem;
      font-weight: 500;
      text-transform: capitalize;
    }

    .medium-actions {
      margin-left: 16px;
    }

    .delete-button {
      color: var(--mat-error-color);
    }

    .suggestions-card {
      margin-bottom: 24px;
    }

    .suggestions-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .suggestion-chip {
      text-transform: capitalize;
      transition: all 0.2s ease;
      gap: 8px;
    }

    .suggestion-chip:not(:disabled):hover {
      background: var(--mat-primary-container-color);
      color: var(--mat-on-primary-container-color);
    }

    .suggestion-chip:disabled {
      opacity: 0.5;
    }

    @media (max-width: 768px) {
      .medium-form {
        flex-direction: column;
        align-items: stretch;
      }

      .add-button {
        margin-top: 16px;
      }

      .suggestions-grid {
        justify-content: center;
      }
    }
  `,
})
export class MediumsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());
  mediums = signal<string[]>([]);

  mediumForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  commonMediums = [
    'Cash',
    'Credit Card',
    'Debit Card',
    'Bank Transfer',
    'PayPal',
    'Venmo',
    'Apple Pay',
    'Google Pay',
    'Check',
    'Gift Card',
    'Cryptocurrency',
    'Mobile Payment',
  ];

  ngOnInit() {
    this.loadMediums();
  }

  private loadMediums() {
    this.apiService.getAllMediums().subscribe({
      next: (mediums) => {
        this.mediums.set(mediums);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading mediums:', error);
        this.loading.set(false);
        this.snackBar.open('Error loading payment methods', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  addMedium() {
    if (!this.mediumForm.valid) return;

    this.submitting.set(true);
    const mediumName = this.mediumForm.value.name.trim();

    this.apiService.createMedium({ name: mediumName }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open('Payment method added successfully', 'Close', {
          duration: 3000,
        });
        this.mediumForm.reset();
        this.loadMediums();
      },
      error: (error) => {
        console.error('Error adding medium:', error);
        this.submitting.set(false);
        this.snackBar.open('Error adding payment method', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  addSuggestedMedium(mediumName: string) {
    this.submitting.set(true);

    this.apiService.createMedium({ name: mediumName }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(`"${mediumName}" added successfully`, 'Close', {
          duration: 3000,
        });
        this.loadMediums();
      },
      error: (error) => {
        console.error('Error adding suggested medium:', error);
        this.submitting.set(false);
        this.snackBar.open('Error adding payment method', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  deleteMedium(mediumName: string) {
    if (
      !confirm(
        `Are you sure you want to delete the payment method "${mediumName}"?`
      )
    )
      return;

    // Add to deleting set
    const newDeleting = new Set(this.deleting());
    newDeleting.add(mediumName);
    this.deleting.set(newDeleting);

    this.apiService.deleteMedium(mediumName).subscribe({
      next: () => {
        // Remove from deleting set
        const updatedDeleting = new Set(this.deleting());
        updatedDeleting.delete(mediumName);
        this.deleting.set(updatedDeleting);

        this.snackBar.open('Payment method deleted successfully', 'Close', {
          duration: 3000,
        });
        this.loadMediums();
      },
      error: (error) => {
        console.error('Error deleting medium:', error);

        // Remove from deleting set on error too
        const updatedDeleting = new Set(this.deleting());
        updatedDeleting.delete(mediumName);
        this.deleting.set(updatedDeleting);

        this.snackBar.open('Error deleting payment method', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  getMediumIcon(mediumName: string): string {
    const name = mediumName.toLowerCase();
    if (name.includes('cash')) return 'money';
    if (name.includes('credit') || name.includes('card')) return 'credit_card';
    if (name.includes('debit')) return 'credit_card';
    if (name.includes('bank') || name.includes('transfer'))
      return 'account_balance';
    if (name.includes('paypal')) return 'payment';
    if (name.includes('venmo')) return 'payment';
    if (name.includes('apple')) return 'smartphone';
    if (name.includes('google')) return 'smartphone';
    if (name.includes('check')) return 'receipt';
    if (name.includes('gift')) return 'card_giftcard';
    if (name.includes('crypto')) return 'currency_bitcoin';
    if (name.includes('mobile')) return 'smartphone';
    return 'payment';
  }
}
