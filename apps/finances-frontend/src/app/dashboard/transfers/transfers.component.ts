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
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import {
  FinanceApiService,
  Transfer,
  TransferInput,
  Account,
} from '../../services/finance-api.service';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';
import { formatAbsoluteDate, createAbsoluteDate } from '../../utils/date-utils';

@Component({
  selector: 'app-transfers',
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
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  styleUrl: './transfers.component.scss',
  template: `
    <div class="transfers-container">
      <!-- Modern Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <h1 class="page-title">
              <mat-icon>swap_horiz</mat-icon>
              Transfers
            </h1>
            <p class="page-subtitle">
              Move money between your accounts and track transfers
            </p>
          </div>
          <div class="controls-section">
            <div class="header-stats">
              <div class="stat-chip">
                <mat-icon>list</mat-icon>
                <span>{{ transfers().length }} Transfers</span>
              </div>
              <div class="stat-chip">
                <mat-icon>account_balance_wallet</mat-icon>
                <span>{{ formatCurrency(getTotalTransferAmount()) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      @if (loading()) {
      <div class="loading-container">
        <mat-spinner></mat-spinner>
        <h3>Loading Transfers</h3>
        <p>Setting up your transfer management...</p>
      </div>
      } @else {

      <!-- Quick Add Form -->
      <mat-card class="quick-add-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>add_circle</mat-icon>
            Create Transfer
          </mat-card-title>
          <mat-card-subtitle
            >Move money between your accounts</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="transferForm" class="quick-add-form">
            <div class="form-row">
              <mat-form-field appearance="outline" class="account-field">
                <mat-label>From Account</mat-label>
                <mat-select formControlName="fromAccountId">
                  @for (account of accounts(); track account.id) {
                  <mat-option [value]="account.id">{{
                    account.name
                  }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="account-field">
                <mat-label>To Account</mat-label>
                <mat-select formControlName="toAccountId">
                  @for (account of accounts(); track account.id) {
                  <mat-option [value]="account.id">{{
                    account.name
                  }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>

            <div class="form-row">
              <mat-form-field appearance="outline" class="amount-field">
                <mat-label>Amount</mat-label>
                <input
                  matInput
                  formControlName="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                />
                <span matSuffix>CAD</span>
              </mat-form-field>

              <mat-form-field appearance="outline" class="date-field">
                <mat-label>Transfer Date</mat-label>
                <input
                  matInput
                  formControlName="date"
                  [matDatepicker]="picker"
                />
                <mat-datepicker-toggle
                  matSuffix
                  [for]="picker"
                ></mat-datepicker-toggle>
                <mat-datepicker #picker></mat-datepicker>
              </mat-form-field>

              <mat-form-field appearance="outline" class="type-field">
                <mat-label>Transfer Type</mat-label>
                <mat-select formControlName="transferType">
                  <mat-option value="INTERNAL">Internal Transfer</mat-option>
                  <mat-option value="EXTERNAL">External Transfer</mat-option>
                  <mat-option value="DEPOSIT">Deposit</mat-option>
                  <mat-option value="WITHDRAWAL">Withdrawal</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="description-field">
              <mat-label>Description</mat-label>
              <textarea
                matInput
                formControlName="description"
                rows="2"
                placeholder="Details about this transfer"
              ></textarea>
            </mat-form-field>

            <button
              mat-raised-button
              color="primary"
              (click)="addTransfer()"
              [disabled]="!transferForm.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
              Creating... } @else {
              <ng-container>
                <mat-icon>swap_horiz</mat-icon>
                Create Transfer
              </ng-container>
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Transfers List -->
      <mat-card class="transfers-list-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>list</mat-icon>
            Recent Transfers
          </mat-card-title>
          <mat-card-subtitle
            >{{ transfers().length }} transfers total</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (transfers().length === 0) {
          <div class="empty-state">
            <mat-icon>swap_horiz</mat-icon>
            <h3>No Transfers Yet</h3>
            <p>
              Create your first transfer above to start moving money between
              accounts
            </p>
          </div>
          } @else {
          <div class="transfers-list">
            @for (transfer of transfers(); track transfer.id) {
            <div class="transfer-card">
              <div class="transfer-header">
                <div class="transfer-icon">
                  <mat-icon>{{
                    getTransferIcon(transfer.transferType)
                  }}</mat-icon>
                </div>
                <div class="transfer-type">
                  <span
                    class="type-badge"
                    [class]="'type-' + transfer.transferType.toLowerCase()"
                  >
                    {{ transfer.transferType }}
                  </span>
                </div>
              </div>

              <div class="transfer-info">
                <div class="transfer-flow">
                  <div class="account-info">
                    <div class="account-label">From</div>
                    <div class="account-name">
                      {{ transfer.fromAccount.name }}
                    </div>
                  </div>
                  <div class="flow-arrow">
                    <mat-icon>arrow_forward</mat-icon>
                  </div>
                  <div class="account-info">
                    <div class="account-label">To</div>
                    <div class="account-name">
                      {{ transfer.toAccount.name }}
                    </div>
                  </div>
                </div>

                <div class="transfer-details">
                  <div class="transfer-amount">
                    {{ formatCurrency(transfer.amount) }}
                  </div>
                  <div class="transfer-date">
                    {{ formatDate(transfer.date) }}
                  </div>
                  <div class="transfer-description">
                    {{ transfer.description }}
                  </div>
                </div>
              </div>

              <div class="transfer-actions">
                <button
                  mat-icon-button
                  (click)="editTransfer(transfer)"
                  class="edit-button"
                  matTooltip="Edit transfer"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  mat-icon-button
                  (click)="deleteTransfer(transfer)"
                  class="delete-button"
                  [disabled]="deleting().has(transfer.id)"
                  matTooltip="Delete transfer"
                >
                  @if (deleting().has(transfer.id)) {
                  <mat-spinner diameter="16"></mat-spinner>
                  } @else {
                  <mat-icon>delete</mat-icon>
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
export class TransfersComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());
  transfers = signal<Transfer[]>([]);
  accounts = signal<Account[]>([]);

  transferForm: FormGroup = this.fb.group({
    transferType: ['INTERNAL', Validators.required],
    fromAccountId: ['', Validators.required],
    toAccountId: ['', Validators.required],
    date: [new Date(), Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    description: ['', Validators.required],
  });

  ngOnInit() {
    this.loadData();
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const [transfers, accounts] = await Promise.all([
        firstValueFrom(this.apiService.getAllTransfers()),
        firstValueFrom(this.apiService.getAllAccounts()),
      ]);
      this.transfers.set(transfers);
      this.accounts.set(accounts);
    } catch (error) {
      this.snackBar.open('Failed to load data', 'Close', { duration: 3000 });
      console.error('Error loading data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async addTransfer() {
    if (!this.transferForm.valid) return;

    this.submitting.set(true);
    try {
      const transferData: TransferInput = {
        ...this.transferForm.value,
        date: this.formatDateForAPI(this.transferForm.value.date),
      };

      const newTransfer = await firstValueFrom(
        this.apiService.createTransfer(transferData)
      );
      this.transfers.update((transfers) => [newTransfer, ...transfers]);
      this.transferForm.reset({
        transferType: 'INTERNAL',
        date: new Date(),
        amount: 0,
      });
      this.snackBar.open('Transfer created successfully', 'Close', {
        duration: 3000,
      });
    } catch (error) {
      this.snackBar.open('Failed to create transfer', 'Close', {
        duration: 3000,
      });
      console.error('Error creating transfer:', error);
    } finally {
      this.submitting.set(false);
    }
  }

  async editTransfer(transfer: Transfer) {
    // For now, just populate the form - in a real app you might open a dialog
    this.transferForm.patchValue({
      transferType: transfer.transferType,
      fromAccountId: transfer.fromAccount.id,
      toAccountId: transfer.toAccount.id,
      date: createAbsoluteDate(transfer.date),
      amount: transfer.amount,
      description: transfer.description,
    });
    this.snackBar.open('Transfer loaded for editing', 'Close', {
      duration: 2000,
    });
  }

  async deleteTransfer(transfer: Transfer) {
    const confirmed = await firstValueFrom(
      this.dialogService.confirm(
        `Are you sure you want to delete this transfer of ${this.formatCurrency(
          transfer.amount
        )}?`,
        'Delete Transfer',
        'Delete',
        'Cancel'
      )
    );

    if (!confirmed) return;

    // Add to deleting set
    const newDeleting = new Set(this.deleting());
    newDeleting.add(transfer.id);
    this.deleting.set(newDeleting);

    try {
      await firstValueFrom(this.apiService.deleteTransfer(transfer.id));
      this.transfers.update((transfers) =>
        transfers.filter((t) => t.id !== transfer.id)
      );
      this.snackBar.open('Transfer deleted successfully', 'Close', {
        duration: 3000,
      });
    } catch (error) {
      this.snackBar.open('Failed to delete transfer', 'Close', {
        duration: 3000,
      });
      console.error('Error deleting transfer:', error);
    } finally {
      // Remove from deleting set
      const updatedDeleting = new Set(this.deleting());
      updatedDeleting.delete(transfer.id);
      this.deleting.set(updatedDeleting);
    }
  }

  getTotalTransferAmount(): number {
    return this.transfers().reduce(
      (total, transfer) => total + transfer.amount,
      0
    );
  }

  getTransferIcon(transferType: string): string {
    switch (transferType) {
      case 'INTERNAL':
        return 'swap_horiz';
      case 'EXTERNAL':
        return 'send';
      case 'DEPOSIT':
        return 'arrow_downward';
      case 'WITHDRAWAL':
        return 'arrow_upward';
      default:
        return 'swap_horiz';
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return formatAbsoluteDate(dateString, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private formatDateForAPI(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
