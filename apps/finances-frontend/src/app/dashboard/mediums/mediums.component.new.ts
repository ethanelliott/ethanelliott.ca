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
import { MatTooltipModule } from '@angular/material/tooltip';
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
    MatTooltipModule,
  ],
  styleUrl: './mediums.component.scss',
  template: `
    <div class="mediums-container">
      <!-- Modern Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <h1 class="page-title">
              <mat-icon fontIcon="fa-credit-card"></mat-icon>
              Payment Methods
            </h1>
            <p class="page-subtitle">
              Manage how you pay for transactions and track spending patterns
            </p>
          </div>
          <div class="controls-section">
            <div class="header-stats">
              <div class="stat-chip">
                <mat-icon fontIcon="fa-list"></mat-icon>
                <span>{{ financeStore.mediums().length }} Methods</span>
              </div>
              <div class="stat-chip">
                <mat-icon fontIcon="fa-chart-line"></mat-icon>
                <span>{{ getMostUsedMedium() }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      @if (loading()) {
      <div class="loading-container">
        <mat-spinner></mat-spinner>
        <h3>Loading Payment Methods</h3>
        <p>Setting up your payment method management...</p>
      </div>
      } @else {

      <!-- Quick Add Form -->
      <mat-card class="quick-add-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon fontIcon="fa-plus-circle"></mat-icon>
            Add Payment Method
          </mat-card-title>
          <mat-card-subtitle
            >Quickly add a new payment method to track your
            transactions</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="mediumForm" class="quick-add-form">
            <mat-form-field appearance="outline" class="medium-name-field">
              <mat-label>Payment Method Name</mat-label>
              <input
                matInput
                formControlName="name"
                required
                placeholder="e.g., Chase Credit Card, Cash, Venmo"
              />
              <mat-icon matSuffix fontIcon="fa-credit-card"></mat-icon>
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
              Adding... } @else {
              <ng-container>
                <mat-icon fontIcon="fa-plus"></mat-icon>
                Add Method
              </ng-container>
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Analytics Grid -->
      <div class="analytics-grid">
        <!-- Payment Methods Overview -->
        <mat-card class="overview-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon fontIcon="fa-chart-pie"></mat-icon>
              Payment Methods Overview
            </mat-card-title>
            <mat-card-subtitle
              >Your payment method usage and statistics</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            @if (financeStore.mediums().length === 0) {
            <div class="empty-analytics">
              <mat-icon fontIcon="fa-credit-card"></mat-icon>
              <p>No payment methods yet. Add your first method above!</p>
            </div>
            } @else {
            <div class="analytics-stats">
              <div class="stat-item">
                <div class="stat-icon">
                  <mat-icon fontIcon="fa-credit-card"></mat-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Total Methods</div>
                  <div class="stat-value">
                    {{ financeStore.mediums().length }}
                  </div>
                  <div class="stat-meta">Active payment options</div>
                </div>
              </div>
              <div class="stat-item">
                <div class="stat-icon">
                  <mat-icon fontIcon="fa-star"></mat-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Most Used</div>
                  <div class="stat-value">{{ getMostUsedMedium() }}</div>
                  <div class="stat-meta">Primary payment method</div>
                </div>
              </div>
              <div class="stat-item">
                <div class="stat-icon">
                  <mat-icon fontIcon="fa-chart-line"></mat-icon>
                </div>
                <div class="stat-content">
                  <div class="stat-label">Usage Distribution</div>
                  <div class="stat-value">{{ getUsageDistribution() }}</div>
                  <div class="stat-meta">Payment diversity</div>
                </div>
              </div>
            </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Quick Suggestions -->
        <mat-card class="suggestions-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon fontIcon="fa-lightbulb"></mat-icon>
              Common Methods
            </mat-card-title>
            <mat-card-subtitle
              >Click to quickly add popular payment methods</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            <div class="suggestions-grid">
              @for (suggestion of getFilteredSuggestions(); track suggestion) {
              <button
                mat-stroked-button
                (click)="addSuggestedMedium(suggestion)"
                [disabled]="submitting()"
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

      <!-- Payment Methods List -->
      <mat-card class="mediums-list-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon fontIcon="fa-list"></mat-icon>
            All Payment Methods
          </mat-card-title>
          <mat-card-subtitle
            >Manage your {{ financeStore.mediums().length }} payment
            methods</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (financeStore.mediums().length === 0) {
          <div class="empty-state">
            <mat-icon fontIcon="fa-credit-card"></mat-icon>
            <h3>No Payment Methods Yet</h3>
            <p>
              Add your first payment method above to start tracking how you pay
              for transactions
            </p>
          </div>
          } @else {
          <div class="mediums-grid">
            @for (medium of financeStore.mediums(); track medium) {
            <div class="medium-card">
              <div class="medium-icon">
                <mat-icon [fontIcon]="getMediumIcon(medium)"></mat-icon>
              </div>
              <div class="medium-info">
                <div class="medium-name">{{ medium }}</div>
                <div class="medium-meta">
                  <span class="usage-count"
                    >{{ getMediumUsageCount(medium) }} transactions</span
                  >
                  <span class="usage-amount">{{
                    getMediumUsageAmount(medium)
                  }}</span>
                </div>
              </div>
              <div class="medium-actions">
                <button
                  mat-icon-button
                  (click)="deleteMedium(medium)"
                  class="delete-button"
                  [disabled]="deleting().has(medium)"
                  matTooltip="Delete payment method"
                >
                  @if (deleting().has(medium)) {
                  <mat-spinner diameter="16"></mat-spinner>
                  } @else {
                  <mat-icon fontIcon="fa-trash"></mat-icon>
                  }
                </button>
              </div>
            </div>
            }
          </div>
          }
        </mat-card-content>
      </mat-card>

      }
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
        'Are you sure you want to delete the payment method "' +
          mediumName +
          '"?'
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

  getMostUsedMedium(): string {
    const mediumBreakdown = this.financeStore.mediumBreakdown();
    if (mediumBreakdown.length === 0) return 'None';
    return mediumBreakdown[0].medium;
  }

  getUsageDistribution(): string {
    const mediums = this.financeStore.mediums();
    if (mediums.length === 0) return 'No data';
    if (mediums.length === 1) return 'Single method';
    if (mediums.length <= 3) return 'Focused';
    return 'Diverse';
  }

  getFilteredSuggestions(): string[] {
    const existingMediums = this.financeStore.mediums();
    return this.commonMediums.filter(
      (medium) => !existingMediums.includes(medium)
    );
  }

  getMediumUsageCount(mediumName: string): number {
    const mediumBreakdown = this.financeStore.mediumBreakdown();
    const breakdown = mediumBreakdown.find((m) => m.medium === mediumName);
    return breakdown ? breakdown.count : 0;
  }

  getMediumUsageAmount(mediumName: string): string {
    const mediumBreakdown = this.financeStore.mediumBreakdown();
    const breakdown = mediumBreakdown.find((m) => m.medium === mediumName);
    if (!breakdown) return '$0';
    const total = breakdown.income + breakdown.expenses;
    return this.formatCurrency(total);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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
