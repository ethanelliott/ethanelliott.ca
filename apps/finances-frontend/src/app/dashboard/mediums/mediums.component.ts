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
import { injectFinanceStore } from '../../store/finance.provider';

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
  styleUrl: './mediums.component.scss',
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
                <mat-icon fontIcon="fa-plus"></mat-icon>
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
            >{{ financeStore.mediums().length }} payment methods
            available</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <p>Loading payment methods...</p>
          </div>
          } @else if (financeStore.mediums().length === 0) {
          <div class="empty-state">
            <mat-icon fontIcon="fa-credit-card"></mat-icon>
            <h3>No payment methods yet</h3>
            <p>
              Add your first payment method above to start tracking transaction
              methods
            </p>
          </div>
          } @else {
          <mat-list class="mediums-list">
            @for (medium of financeStore.mediums(); track medium) {
            <mat-list-item class="medium-item">
              <div matListItemTitle class="medium-info">
                <mat-icon
                  matListItemIcon
                  class="medium-icon"
                  [fontIcon]="getMediumIcon(medium)"
                ></mat-icon>
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
                  <mat-icon fontIcon="fa-trash"></mat-icon>
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
              [disabled]="
                financeStore.mediums().includes(suggestion) || submitting()
              "
              class="suggestion-chip"
            >
              <mat-icon [fontIcon]="getMediumIcon(suggestion)"></mat-icon>
              {{ suggestion }}
            </button>
            }
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class MediumsComponent implements OnInit {
  readonly financeStore = injectFinanceStore();
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());

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
    // Load data if not already loaded
    if (!this.financeStore.initialLoadComplete()) {
      this.financeStore.loadAllData();
    }
    this.loading.set(false);
  }

  addMedium() {
    if (!this.mediumForm.valid) return;

    this.submitting.set(true);
    const mediumName = this.mediumForm.value.name.trim();

    this.financeStore.createMedium(mediumName);
    this.submitting.set(false);
    this.mediumForm.reset();
  }

  addSuggestedMedium(mediumName: string) {
    this.submitting.set(true);
    this.financeStore.createMedium(mediumName);
    this.submitting.set(false);
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

    this.financeStore.deleteMedium(mediumName);

    // Remove from deleting set
    const updatedDeleting = new Set(this.deleting());
    updatedDeleting.delete(mediumName);
    this.deleting.set(updatedDeleting);
  }

  getMediumIcon(mediumName: string): string {
    const name = mediumName.toLowerCase();
    if (name.includes('cash')) return 'fa-money-bill';
    if (name.includes('credit') || name.includes('card'))
      return 'fa-credit-card';
    if (name.includes('debit')) return 'fa-credit-card';
    if (name.includes('bank') || name.includes('transfer'))
      return 'fa-building-columns';
    if (name.includes('paypal')) return 'fa-paypal';
    if (name.includes('venmo')) return 'fa-money-bill-transfer';
    if (name.includes('apple')) return 'fa-mobile-screen';
    if (name.includes('google')) return 'fa-mobile-screen';
    if (name.includes('check')) return 'fa-receipt';
    if (name.includes('gift')) return 'fa-gift';
    if (name.includes('crypto')) return 'fa-bitcoin';
    if (name.includes('mobile')) return 'fa-mobile-screen';
    return 'fa-credit-card';
  }
}
