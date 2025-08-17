import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Transaction } from '../../services/finance-api.service';
import { injectFinanceStore } from '../../store/finance.provider';
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
  styleUrl: './transactions.component.scss',
  template: `
    <div class="transactions-container">
      <!-- Header -->
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <h1 class="page-title">Transactions</h1>
            <p class="page-subtitle">
              {{ financeStore.transactionCount() }} transactions total
            </p>
          </div>
          <div class="controls-section">
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
        </div>
      </div>

      <!-- Transactions Grid -->
      <mat-card class="transactions-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>list</mat-icon>
            All Transactions
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (financeStore.loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <h3>Loading transactions...</h3>
            <p>Please wait while we fetch your transaction data</p>
          </div>
          } @else if (financeStore.transactionCount() === 0) {
          <div class="empty-state">
            <mat-icon>receipt</mat-icon>
            <h3>No transactions yet</h3>
            <p>Start tracking your finances by adding your first transaction</p>
            <button
              mat-raised-button
              color="primary"
              (click)="openTransactionDialog()"
              class="get-started-button"
            >
              <mat-icon>add</mat-icon>
              Add Your First Transaction
            </button>
          </div>
          } @else {
          <div class="transactions-grid-container">
            <app-transactions-grid
              (editTransaction)="openTransactionDialog($event)"
            ></app-transactions-grid>
          </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class TransactionsComponent implements OnInit {
  readonly financeStore = injectFinanceStore();
  private readonly dialog = inject(MatDialog);

  ngOnInit() {
    // Load all data when component initializes
    if (!this.financeStore.initialLoadComplete()) {
      this.financeStore.loadAllData();
    }
  }

  openTransactionDialog(transaction?: Transaction) {
    const dialogRef = this.dialog.open(TransactionDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      data: {
        transaction,
        categories: this.financeStore.categories(),
        mediums: this.financeStore.mediums(),
        tags: this.financeStore.tags(),
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && !result.error) {
        // The store handles the success notifications, just refresh data if needed
        this.financeStore.refreshTransactions();
      }
    });
  }
}
