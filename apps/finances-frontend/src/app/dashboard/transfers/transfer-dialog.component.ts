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
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  FinanceApiService,
  Transfer,
  TransferInput,
  Account,
} from '../../services/finance-api.service';
import { firstValueFrom } from 'rxjs';
import { createAbsoluteDate } from '../../utils/date-utils';

export interface TransferDialogData {
  transfer?: Transfer;
  accounts: Account[];
}

@Component({
  selector: 'app-transfer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule
],
  template: `
    <div class="dialog-header">
      <h2 mat-dialog-title>
        {{ data.transfer ? 'Edit Transfer' : 'Create New Transfer' }}
      </h2>
      <button mat-icon-button mat-dialog-close>
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <div mat-dialog-content class="dialog-content">
      <form [formGroup]="transferForm" class="transfer-form">
        <div class="form-row">
          <mat-form-field appearance="outline" class="transfer-type-field">
            <mat-label>Transfer Type</mat-label>
            <mat-select formControlName="transferType" required>
              <mat-option value="INTERNAL">Internal Transfer</mat-option>
              <mat-option value="EXTERNAL">External Transfer</mat-option>
              <mat-option value="DEPOSIT">Deposit</mat-option>
              <mat-option value="WITHDRAWAL">Withdrawal</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="amount-field">
            <mat-label>Amount</mat-label>
            <input
              matInput
              type="number"
              formControlName="amount"
              required
              min="0"
              step="0.01"
            />
            <span matTextPrefix>$</span>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="account-field">
            <mat-label>From Account</mat-label>
            <mat-select formControlName="fromAccountId" required>
              @for (account of data.accounts; track account.id) {
              <mat-option [value]="account.id">{{ account.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="account-field">
            <mat-label>To Account</mat-label>
            <mat-select formControlName="toAccountId" required>
              @for (account of data.accounts; track account.id) {
              <mat-option [value]="account.id">{{ account.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="date-field">
          <mat-label>Transfer Date</mat-label>
          <input
            matInput
            formControlName="date"
            [matDatepicker]="picker"
            required
          />
          <mat-datepicker-toggle
            matSuffix
            [for]="picker"
          ></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline" class="description-field">
          <mat-label>Description</mat-label>
          <textarea
            matInput
            formControlName="description"
            required
            rows="3"
            placeholder="Details about this transfer"
          ></textarea>
        </mat-form-field>
      </form>
    </div>

    <div mat-dialog-actions class="dialog-actions">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-raised-button
        color="primary"
        (click)="saveTransfer()"
        [disabled]="!transferForm.valid || submitting()"
        class="save-button"
      >
        @if (submitting()) {
        <mat-spinner diameter="20"></mat-spinner>
        } @else {
        {{ data.transfer ? 'Update' : 'Create' }} Transfer }
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

    .transfer-form {
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

    .transfer-type-field,
    .amount-field {
      flex: 1;
    }

    .account-field {
      flex: 1;
    }

    .date-field,
    .description-field {
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
export class TransferDialogComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<TransferDialogComponent>);

  readonly data: TransferDialogData = inject(MAT_DIALOG_DATA);
  submitting = signal(false);

  transferForm: FormGroup = this.fb.group({
    transferType: ['INTERNAL', Validators.required],
    fromAccountId: ['', Validators.required],
    toAccountId: ['', Validators.required],
    date: [new Date(), Validators.required],
    amount: ['', [Validators.required, Validators.min(0.01)]],
    description: ['', Validators.required],
  });

  ngOnInit() {
    if (this.data.transfer) {
      // Editing existing transfer
      const transfer = this.data.transfer;
      this.transferForm.patchValue({
        transferType: transfer.transferType,
        fromAccountId: transfer.fromAccount.id,
        toAccountId: transfer.toAccount.id,
        date: createAbsoluteDate(transfer.date),
        amount: transfer.amount,
        description: transfer.description,
      });
    }
  }

  async saveTransfer() {
    if (!this.transferForm.valid) return;

    this.submitting.set(true);
    const formValue = this.transferForm.value;

    const transferData: TransferInput = {
      transferType: formValue.transferType,
      fromAccountId: formValue.fromAccountId,
      toAccountId: formValue.toAccountId,
      date: this.formatDateForAPI(formValue.date),
      amount: parseFloat(formValue.amount),
      description: formValue.description,
    };

    try {
      if (this.data.transfer) {
        // Update existing transfer
        await firstValueFrom(
          this.apiService.updateTransfer(this.data.transfer.id, transferData)
        );
      } else {
        // Create new transfer
        await firstValueFrom(this.apiService.createTransfer(transferData));
      }

      this.dialogRef.close({ success: true });
    } catch (error) {
      console.error('Error saving transfer:', error);
      this.dialogRef.close({ error: true });
    } finally {
      this.submitting.set(false);
    }
  }

  private formatDateForAPI(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
