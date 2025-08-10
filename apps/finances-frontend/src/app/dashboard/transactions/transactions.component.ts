import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Transaction } from '../../services/finance-api.service';
import { TransactionsService } from '../../services/transactions.service';
import { TransactionDialogComponent } from './transaction-dialog.component';
import { TransactionsGridComponent } from './transactions-grid.component';

@Component({
  selector: 'app-transactions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatDialogModule,
    TransactionsGridComponent,
  ],
  template: `
    <div class="transactions-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h1 class="page-title">Transactions</h1>
          <p class="page-subtitle">
            {{ transactionsService.transactionCount() }} transactions total
          </p>
        </div>
        <button
          mat-raised-button
          color="primary"
          (click)="openTransactionDialog()"
          class="add-button"
        >
          <mat-icon>add</mat-icon>
          Add Transaction
        </button>
      </div>

      <!-- Transactions Grid -->
      <mat-card class="grid-card">
        <mat-card-content>
          @if (transactionsService.loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <p>Loading transactions...</p>
          </div>
          } @else if (transactionsService.transactionCount() === 0) {
          <div class="empty-state">
            <mat-icon>receipt_long</mat-icon>
            <h3>No transactions yet</h3>
            <p>Click "Add Transaction" to add your first transaction</p>
          </div>
          } @else {
          <app-transactions-grid
            (editTransaction)="openTransactionDialog($event)"
          ></app-transactions-grid>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .transactions-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 16px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .header-content {
      flex: 1;
    }

    .page-title {
      font-size: 2rem;
      font-weight: 400;
      margin: 0 0 4px 0;
      color: var(--mat-sys-primary);
    }

    .page-subtitle {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
      font-size: 0.875rem;
    }

    .add-button {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 16px;
    }

    .grid-card {
      margin-bottom: 24px;
    }

    .grid-card mat-card-content {
      padding: 0;
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
      color: var(--mat-sys-on-surface-variant);
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

    @media (max-width: 768px) {
      .transactions-container {
        padding: 0 8px;
      }

      .page-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 16px;
      }

      .add-button {
        margin-left: 0;
        align-self: flex-end;
      }
    }
  `,
})
export class TransactionsComponent {
  readonly transactionsService = inject(TransactionsService);
  private readonly dialog = inject(MatDialog);

  openTransactionDialog(transaction?: Transaction) {
    const dialogRef = this.dialog.open(TransactionDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      data: {
        transaction,
        categories: this.transactionsService.categories(),
        mediums: this.transactionsService.mediums(),
        tags: this.transactionsService.tags(),
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && !result.error) {
        // The service handles the success notifications, just refresh data if needed
        this.transactionsService.loadAllData();
      }
    });
  }
}
