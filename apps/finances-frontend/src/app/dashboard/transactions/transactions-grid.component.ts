import { CommonModule } from '@angular/common';
import { Component, output, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  ColDef,
  GridApi,
  GridOptions,
  ICellRendererParams,
  ModuleRegistry,
  themeMaterial,
  ValueFormatterParams,
  CellEditingStoppedEvent,
  colorSchemeDark,
} from 'ag-grid-community';
import { Transaction } from '../../services/finance-api.service';
import { injectFinanceStore } from '../../store/finance.provider';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';
import {
  ActionsCellRendererComponent,
  ActionsCellRendererParams,
} from './actions-cell-renderer.component';
import { TagsCellRendererComponent } from './tags-cell-renderer.component';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'app-transactions-grid',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, AgGridAngular],
  template: `
    <ag-grid-angular
      class="transactions-grid"
      [rowData]="financeStore.transactions()"
      [columnDefs]="columnDefs"
      [gridOptions]="gridOptions"
      [domLayout]="'autoHeight'"
      animateRows="true"
      enableStatusBar="true"
      (gridReady)="onGridReady($event)"
      (cellEditingStopped)="onCellEditingStopped($event)"
    ></ag-grid-angular>
  `,
  styles: `
    .transactions-grid {
      width: 100%;
      height: 100%;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--mat-sys-outline-variant);
      box-shadow: var(--mat-sys-elevation-1);
    }
  `,
})
export class TransactionsGridComponent {
  readonly financeStore = injectFinanceStore();
  private readonly dialogService = inject(DialogService);

  // Only keep the edit transaction output since the store handles the rest
  editTransaction = output<Transaction>();

  private gridApi!: GridApi;

  constructor() {
    // Use effect to watch for changes in transactions
    effect(() => {
      const currentTransactions = this.financeStore.transactions();
      if (this.gridApi) {
        this.gridApi.setGridOption('rowData', currentTransactions);
      }
    });
  }

  // AG-Grid configuration
  columnDefs: ColDef[] = [
    {
      headerName: 'Date',
      field: 'date',
      width: 120,
      sortable: true,
      filter: 'agDateColumnFilter',
      editable: true,
      cellEditor: 'agDateCellEditor',
      valueFormatter: (params: ValueFormatterParams) =>
        this.formatDate(params.value),
      valueSetter: (params) => {
        const newValue = new Date(params.newValue).toISOString().split('T')[0];
        params.data.date = newValue;
        return true;
      },
    },
    {
      headerName: 'Description',
      field: 'description',
      flex: 2,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agTextCellEditor',
    },
    {
      headerName: 'Type',
      field: 'type',
      width: 100,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['INCOME', 'EXPENSE'],
      },
      cellStyle: (params) => {
        if (params.value === 'INCOME') {
          return { color: '#4caf50', fontWeight: '600' };
        } else {
          return { color: '#f44336', fontWeight: '600' };
        }
      },
      valueFormatter: (params: ValueFormatterParams) =>
        params.value === 'INCOME' ? 'Income' : 'Expense',
    },
    {
      headerName: 'Amount',
      field: 'amount',
      width: 120,
      sortable: true,
      filter: 'agNumberColumnFilter',
      editable: true,
      cellEditor: 'agNumberCellEditor',
      cellEditorParams: {
        min: 0,
        precision: 2,
      },
      cellClass: (params) =>
        params.data.type === 'INCOME' ? 'income-amount' : 'expense-amount',
      valueFormatter: (params: ValueFormatterParams) => {
        const sign = params.data.type === 'INCOME' ? '+' : '-';
        return sign + this.formatCurrency(params.value);
      },
      valueSetter: (params) => {
        params.data.amount = parseFloat(params.newValue);
        return true;
      },
    },
    {
      headerName: 'Category',
      field: 'category',
      width: 140,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: () => ({
        values: this.financeStore.categories(),
      }),
    },
    {
      headerName: 'Payment Method',
      field: 'medium',
      width: 140,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: () => ({
        values: this.financeStore.mediums(),
      }),
    },
    {
      headerName: 'Tags',
      field: 'tags',
      width: 200,
      sortable: false,
      filter: false,
      editable: false, // Tags are more complex, keep dialog for this
      cellRenderer: TagsCellRendererComponent,
    },
    {
      headerName: 'Actions',
      field: 'actions',
      width: 120,
      sortable: false,
      filter: false,
      pinned: 'right',
      editable: false,
      cellRenderer: ActionsCellRendererComponent,
      cellRendererParams: {
        onEdit: (data: Transaction) => this.onEditTransaction(data),
        onDelete: (id: string) => this.onDeleteTransaction(id),
      } as ActionsCellRendererParams,
    },
  ];

  gridOptions: GridOptions = {
    theme: themeMaterial.withPart(colorSchemeDark).withParams({
      // Surface colors
      backgroundColor: 'var(--mat-sys-surface)',

      // Header styling
      headerBackgroundColor: 'var(--mat-sys-surface-variant)',
      headerTextColor: 'var(--mat-sys-on-surface-variant)',

      // Text colors
      textColor: 'var(--mat-sys-on-surface)',

      // Border colors
      borderColor: 'var(--mat-sys-outline-variant)',

      // Row styling
      selectedRowBackgroundColor: 'var(--mat-sys-primary-container)',

      // Brand colors
      accentColor: 'var(--mat-sys-primary)',
      primaryColor: 'var(--mat-sys-primary)',

      // Input styling
      inputBackgroundColor: 'var(--mat-sys-surface-container-highest)',
      inputTextColor: 'var(--mat-sys-on-surface)',

      // Menu and dropdown styling

      // Spacing
      spacing: 8,

      // Border radius
      borderRadius: 4,
    }),
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: 'agTextColumnFilter',
    },
    stopEditingWhenCellsLoseFocus: true,
  };

  onGridReady(params: any): void {
    this.gridApi = params.api;
    params.api.sizeColumnsToFit();
  }

  onCellEditingStopped(event: CellEditingStoppedEvent): void {
    if (event.valueChanged) {
      this.updateTransaction(event.data);
    }
  }

  private updateTransaction(transaction: Transaction): void {
    if (!transaction.id) {
      return;
    }

    this.financeStore.updateTransaction({
      id: transaction.id,
      transaction: {
        type: transaction.type,
        amount: transaction.amount,
        category: transaction.category,
        medium: transaction.medium,
        date: transaction.date,
        tags: transaction.tags,
        description: transaction.description,
      },
    });
  }

  private onEditTransaction(transaction: Transaction): void {
    this.editTransaction.emit(transaction);
  }

  private async onDeleteTransaction(id: string): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialogService.confirm(
        'Are you sure you want to delete this transaction?',
        'Delete Transaction',
        'Delete',
        'Cancel'
      )
    );

    if (!confirmed) return;

    this.financeStore.deleteTransaction(id);
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  }

  private formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  }
}
