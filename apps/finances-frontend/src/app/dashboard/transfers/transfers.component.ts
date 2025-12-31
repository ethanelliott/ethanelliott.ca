import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import {
  FinanceApiService,
  Transfer,
  Account,
} from '../../services/finance-api.service';
import { TransferDialogComponent } from './transfer-dialog.component';
import { TransfersGridComponent } from './transfers-grid.component';
import { firstValueFrom } from 'rxjs';
import { formatAbsoluteDate } from '../../utils/date-utils';

@Component({
  selector: 'app-transfers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatChipsModule,
    TransfersGridComponent
],
  styleUrl: './transfers.component.scss',
  template: `
    <div class="transfers-container">
      <div class="page-content">
        <!-- Header Info -->
        <div class="page-header">
          <div class="header-stats">
            <span>{{ transfers().length }} total</span>
          </div>
          <button mat-button (click)="openTransferDialog()" class="add-button">
            <mat-icon>add</mat-icon>
            Add Transfer
          </button>
        </div>

        <!-- Transfers Grid -->
        <mat-card class="transfers-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>swap_horiz</mat-icon>
              All Transfers
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (loading()) {
            <div class="loading-container">
              <mat-spinner></mat-spinner>
              <h3>Loading Transfers</h3>
              <p>Setting up your transfer management...</p>
            </div>
            } @else {

            <!-- Transfers Grid -->
            @if (transfers().length === 0) {
            <div class="empty-state">
              <mat-icon>swap_horiz</mat-icon>
              <h3>No transfers yet</h3>
              <p>
                Create your first transfer to start moving money between
                accounts
              </p>
              <button
                mat-button
                (click)="openTransferDialog()"
                class="get-started-button"
              >
                <mat-icon>add</mat-icon>
                Add Your First Transfer
              </button>
            </div>
            } @else {
            <div class="transfers-grid-container">
              <app-transfers-grid
                [transfers]="transfers()"
                [accounts]="accounts()"
                (editTransfer)="openTransferDialog($event)"
                (deleteTransfer)="deleteTransfer($event)"
              ></app-transfers-grid>
            </div>
            } }
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
})
export class TransfersComponent implements OnInit {
  private readonly financeService = inject(FinanceApiService);
  private readonly dialog = inject(MatDialog);

  readonly page = 'transfers';

  // Signals
  loading = signal(false);
  transfers = signal<Transfer[]>([]);
  accounts = signal<Account[]>([]);
  deleting = signal(new Set<string>());

  ngOnInit() {
    this.loadData();
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const [transfers, accounts] = await Promise.all([
        firstValueFrom(this.financeService.getAllTransfers()),
        firstValueFrom(this.financeService.getAllAccounts()),
      ]);
      this.transfers.set(transfers as Transfer[]);
      this.accounts.set(accounts as Account[]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  openTransferDialog(transfer?: Transfer) {
    const dialogRef = this.dialog.open(TransferDialogComponent, {
      width: '600px',
      data: {
        transfer,
        accounts: this.accounts(),
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        if (transfer) {
          // Update existing transfer
          this.transfers.update((transfers) =>
            transfers.map((t) => (t.id === transfer.id ? result : t))
          );
        } else {
          // Add new transfer
          this.transfers.update((transfers) => [result, ...transfers]);
        }
      }
    });
  }

  async deleteTransfer(transfer: Transfer) {
    this.deleting.update((deleting) => new Set([...deleting, transfer.id]));

    try {
      await firstValueFrom(this.financeService.deleteTransfer(transfer.id));
      this.transfers.update((transfers) =>
        transfers.filter((t) => t.id !== transfer.id)
      );
    } catch (error) {
      console.error('Error deleting transfer:', error);
    } finally {
      this.deleting.update((deleting) => {
        const newSet = new Set(deleting);
        newSet.delete(transfer.id);
        return newSet;
      });
    }
  }
}
