import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  FinanceApiService,
  Transaction,
  Account,
} from '../../services/finance-api.service';
import { TransactionDialogComponent } from './transaction-dialog.component';
import { TransactionsGridComponent } from './transactions-grid.component';
import { firstValueFrom } from 'rxjs';

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
      <!-- Sticky Header -->
      <section class="sticky-header">
        <div class="header-content">
          <div class="header-info">
            <h2 class="page-title">Transactions</h2>
            <div class="header-stats">
              <span>{{ transactions().length }} total</span>
            </div>
          </div>

          <button
            mat-button
            (click)="openTransactionDialog()"
            class="add-button"
          >
            <mat-icon>add</mat-icon>
            Add Transaction
          </button>
        </div>
      </section>

      <div class="page-content">
        <!-- Transactions Grid -->
        <mat-card class="transactions-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>list</mat-icon>
              All Transactions
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (loading()) {
            <div class="loading-container">
              <mat-spinner></mat-spinner>
              <h3>Loading transactions...</h3>
              <p>Please wait while we fetch your transaction data</p>
            </div>
            } @else if (transactions().length === 0) {
            <div class="empty-state">
              <mat-icon>receipt</mat-icon>
              <h3>No transactions yet</h3>
              <p>
                Start tracking your finances by adding your first transaction
              </p>
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
                [transactions]="transactions()"
                (editTransaction)="openTransactionDialog($event)"
                (deleteTransaction)="deleteTransaction($event)"
              ></app-transactions-grid>
            </div>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
})
export class TransactionsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly dialog = inject(MatDialog);

  loading = signal(true);
  transactions = signal<Transaction[]>([]);
  accounts = signal<Account[]>([]);
  categories = signal<string[]>([]);
  tags = signal<string[]>([]);

  ngOnInit() {
    this.loadData();
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const [transactions, accounts, categories, tags] = await Promise.all([
        firstValueFrom(this.apiService.getAllTransactions()),
        firstValueFrom(this.apiService.getAllAccounts()),
        firstValueFrom(this.apiService.getAllCategories()),
        firstValueFrom(this.apiService.getAllTags()),
      ]);
      this.transactions.set(transactions);
      this.accounts.set(accounts);
      this.categories.set(categories);
      this.tags.set(tags);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  openTransactionDialog(transaction?: Transaction) {
    const dialogRef = this.dialog.open(TransactionDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      data: {
        transaction,
        categories: this.categories(),
        accounts: this.accounts(),
        tags: this.tags(),
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && !result.error) {
        // Reload transactions after successful create/update
        this.loadData();
      }
    });
  }

  async deleteTransaction(transaction: Transaction) {
    try {
      await firstValueFrom(this.apiService.deleteTransaction(transaction.id));
      // Remove from local state
      this.transactions.update((transactions) =>
        transactions.filter((t) => t.id !== transaction.id)
      );
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  }
}
