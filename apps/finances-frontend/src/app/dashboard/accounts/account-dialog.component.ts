import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';

import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  FinanceApiService,
  Account,
  AccountInput,
} from '../../services/finance-api.service';
import { firstValueFrom } from 'rxjs';

export interface AccountDialogData {
  account?: Account;
}

@Component({
  selector: 'app-account-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule
],
  template: `
    <div class="dialog-header">
      <h2 mat-dialog-title>
        {{ data.account ? 'Edit Account' : 'Add New Account' }}
      </h2>
      <button mat-icon-button mat-dialog-close>
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <div mat-dialog-content class="dialog-content">
      <form [formGroup]="accountForm" class="account-form">
        <div class="form-row">
          <mat-form-field appearance="outline" class="account-name-field">
            <mat-label>Account Name</mat-label>
            <input
              matInput
              formControlName="name"
              required
              placeholder="e.g., Chase Checking, Savings Account"
            />
            <mat-icon matSuffix>account_balance</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline" class="account-currency-field">
            <mat-label>Currency</mat-label>
            <mat-select formControlName="currency">
              <mat-option value="CAD">CAD</mat-option>
              <mat-option value="USD">USD</mat-option>
              <mat-option value="EUR">EUR</mat-option>
              <mat-option value="GBP">GBP</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="account-balance-field">
          <mat-label>Initial Balance</mat-label>
          <input
            matInput
            formControlName="initialBalance"
            type="number"
            step="0.01"
            placeholder="0.00"
          />
          <span matSuffix>{{ accountForm.value.currency || 'CAD' }}</span>
        </mat-form-field>

        <mat-form-field appearance="outline" class="account-description-field">
          <mat-label>Description (Optional)</mat-label>
          <textarea
            matInput
            formControlName="description"
            rows="3"
            placeholder="Additional details about this account"
          ></textarea>
        </mat-form-field>
      </form>
    </div>

    <div mat-dialog-actions class="dialog-actions">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-raised-button
        color="primary"
        (click)="saveAccount()"
        [disabled]="!accountForm.valid || submitting()"
        class="save-button"
      >
        @if (submitting()) {
        <mat-spinner diameter="20"></mat-spinner>
        } @else {
        {{ data.account ? 'Update' : 'Save' }} Account }
      </button>
    </div>
  `,
  styles: `
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: -24px -24px 0 -24px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .dialog-header h2 {
      margin: 0;
      color: var(--mat-sys-primary);
    }

    .dialog-content {
      padding-top: 24px;
      min-width: 500px;
    }

    .account-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: flex;
      gap: 16px;
    }

    .form-row > * {
      flex: 1;
    }

    .account-name-field {
      flex: 2;
    }

    .account-currency-field {
      flex: 1;
    }

    .account-balance-field,
    .account-description-field {
      width: 100%;
    }

    .dialog-actions {
      gap: 12px;
      margin-top: 24px;
      justify-content: flex-end;
    }

    .save-button {
      min-width: 120px;
    }

    @media (max-width: 768px) {
      .dialog-content {
        min-width: auto;
        max-width: 90vw;
      }

      .form-row {
        flex-direction: column;
      }
    }
  `,
})
export class AccountDialogComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<AccountDialogComponent>);

  readonly data: AccountDialogData = inject(MAT_DIALOG_DATA);
  submitting = signal(false);

  accountForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    initialBalance: [0, [Validators.min(0)]],
    currency: ['CAD', Validators.required],
  });

  ngOnInit() {
    if (this.data.account) {
      // Editing existing account
      const account = this.data.account;
      this.accountForm.patchValue({
        name: account.name,
        description: account.description,
        initialBalance: account.initialBalance,
        currency: account.currency,
      });
    }
  }

  async saveAccount() {
    if (!this.accountForm.valid) return;

    this.submitting.set(true);
    const formValue = this.accountForm.value;

    const accountData: AccountInput = {
      name: formValue.name,
      description: formValue.description,
      initialBalance: parseFloat(formValue.initialBalance),
      currency: formValue.currency,
    };

    try {
      if (this.data.account) {
        // Update existing account
        await firstValueFrom(
          this.apiService.updateAccount(this.data.account.id, accountData)
        );
      } else {
        // Create new account
        await firstValueFrom(this.apiService.createAccount(accountData));
      }

      this.dialogRef.close({ success: true });
    } catch (error) {
      console.error('Error saving account:', error);
      this.dialogRef.close({ error: true });
    } finally {
      this.submitting.set(false);
    }
  }
}
