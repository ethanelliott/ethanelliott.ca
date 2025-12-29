import { CommonModule } from '@angular/common';
import { Component, output, effect, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AgGridAngular } from 'ag-grid-angular';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
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
  ClientSideRowModelModule,
  IDatasource,
  IGetRowsParams,
  InfiniteRowModelModule,
  SortModelItem,
  FilterModel,
  IServerSideGetRowsRequest,
} from 'ag-grid-community';
import { Transaction } from '../../services/finance-api.service';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';
import { formatAbsoluteDate } from '../../utils/date-utils';
import {
  ActionsCellRendererComponent,
  ActionsCellRendererParams,
} from './actions-cell-renderer.component';
import { TagsCellRendererComponent } from './tags-cell-renderer.component';

// Register AG Grid modules
ModuleRegistry.registerModules([InfiniteRowModelModule, AllCommunityModule]);

@Component({
  selector: 'app-transactions-grid',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, AgGridAngular],
  template: `
    <ag-grid-angular
      class="transactions-grid"
      [columnDefs]="columnDefs"
      [gridOptions]="gridOptions"
      animateRows="true"
      enableStatusBar="true"
      (gridReady)="onGridReady($event)"
      (cellEditingStopped)="onCellEditingStopped($event)"
    ></ag-grid-angular>
  `,
  styles: `
    .transactions-grid {
      width: 100%;
      height: 600px; /* Fixed height for infinite scroll */
      border-radius: 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      box-shadow: var(--mat-sys-elevation-1);
    }
  `,
})
export class TransactionsGridComponent {
  private readonly dialogService = inject(DialogService);
  private readonly breakpointObserver = inject(BreakpointObserver);

  isMobile = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset])
      .pipe(map((result) => result.matches)),
    { initialValue: false }
  );

  // Inputs
  transactions = input.required<Transaction[]>();
  categories = input<string[]>([]);
  tags = input<string[]>([]);

  // Outputs
  editTransaction = output<Transaction>();
  deleteTransaction = output<Transaction>();

  private gridApi!: GridApi;
  private datasource!: IDatasource;

  constructor() {
    // Use effect to watch for changes in transactions and update datasource
    effect(() => {
      const currentTransactions = this.transactions();
      if (this.gridApi && this.datasource && currentTransactions) {
        this.updateDatasource(currentTransactions);
      }
    });

    // Effect to update column definitions when categories/tags change
    effect(() => {
      const categories = this.categories();
      const tags = this.tags();

      if (this.gridApi && (categories.length > 0 || tags.length > 0)) {
        this.updateColumnDefinitions();
      }
    });

    // Effect to handle mobile responsiveness
    effect(() => {
      const isMobile = this.isMobile();
      if (this.gridApi) {
        const columnsToHide = ['type', 'category', 'account.name', 'tags'];
        this.gridApi.setColumnsVisible(columnsToHide, !isMobile);

        if (isMobile) {
          this.gridApi.sizeColumnsToFit();
        }
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
        params.value ? this.formatDate(params.value) : '',
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
        params.value === 'INCOME'
          ? 'Income'
          : params.value === 'EXPENSE'
          ? 'Expense'
          : '',
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
      cellClass: (params) => {
        if (!params.data) return '';
        return params.data.type === 'INCOME'
          ? 'income-amount'
          : 'expense-amount';
      },
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.data || !params.value) return '';
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
      cellEditorParams: {
        values: this.categories(), // Categories from input
      },
    },
    {
      headerName: 'Account',
      field: 'account.name',
      width: 140,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: false, // Account changes require selecting from dropdown
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
      filter: true, // Enable filtering by default
      filterParams: {
        debounceMs: 500, // Add debounce for better performance
      },
    },
    stopEditingWhenCellsLoseFocus: true,
    rowModelType: 'infinite',
    cacheBlockSize: 100,
    maxBlocksInCache: 10,
    infiniteInitialRowCount: 1000,
  };

  onGridReady(params: any): void {
    this.gridApi = params.api;

    // Apply initial mobile state
    const isMobile = this.isMobile();
    const columnsToHide = ['type', 'category', 'account.name', 'tags'];
    this.gridApi.setColumnsVisible(columnsToHide, !isMobile);

    params.api.sizeColumnsToFit();

    // Use setTimeout to avoid AG Grid initialization race condition
    setTimeout(() => {
      this.createDatasource();
    }, 0);
  }

  private createDatasource(): void {
    this.datasource = {
      rowCount: undefined, // Will be set dynamically based on filtered data
      getRows: (params: IGetRowsParams) => {
        const transactions = this.transactions();

        // Apply filtering
        let filteredData = this.applyFiltering(
          transactions,
          params.filterModel
        );

        // Apply sorting
        if (params.sortModel && params.sortModel.length > 0) {
          filteredData = this.applySorting(filteredData, params.sortModel);
        }

        const startRow = params.startRow || 0;
        const endRow = params.endRow || 100;

        // Get the requested slice of data
        const rowsThisPage = filteredData.slice(startRow, endRow);

        // Check if we have more data
        const lastRow =
          filteredData.length <= endRow ? filteredData.length : -1;

        // Call the success callback with the data
        params.successCallback(rowsThisPage, lastRow);
      },
    };

    this.gridApi.setGridOption('datasource', this.datasource);
  }

  private applyFiltering(
    data: Transaction[],
    filterModel: FilterModel | undefined
  ): Transaction[] {
    if (!filterModel) return data;

    return data.filter((transaction) => {
      for (const [field, filter] of Object.entries(filterModel)) {
        if (!this.doesTransactionPassFilter(transaction, field, filter)) {
          return false;
        }
      }
      return true;
    });
  }

  private doesTransactionPassFilter(
    transaction: Transaction,
    field: string,
    filter: any
  ): boolean {
    const value = this.getFieldValue(transaction, field);

    if (!filter) return true;

    switch (filter.filterType || filter.type) {
      case 'text':
        return this.applyTextFilter(value, filter);
      case 'number':
        return this.applyNumberFilter(value, filter);
      case 'date':
        return this.applyDateFilter(value, filter);
      default:
        // Simple contains filter for backward compatibility
        if (typeof filter === 'string') {
          return String(value).toLowerCase().includes(filter.toLowerCase());
        }
        return true;
    }
  }

  private getFieldValue(transaction: Transaction, field: string): any {
    switch (field) {
      case 'account.name':
        return transaction.account?.name || '';
      case 'tags':
        return transaction.tags?.join(', ') || '';
      default:
        return transaction[field as keyof Transaction];
    }
  }

  private applyTextFilter(value: any, filter: any): boolean {
    const stringValue = String(value || '').toLowerCase();
    const filterValue = String(filter.filter || '').toLowerCase();

    switch (filter.type) {
      case 'equals':
        return stringValue === filterValue;
      case 'notEqual':
        return stringValue !== filterValue;
      case 'contains':
        return stringValue.includes(filterValue);
      case 'notContains':
        return !stringValue.includes(filterValue);
      case 'startsWith':
        return stringValue.startsWith(filterValue);
      case 'endsWith':
        return stringValue.endsWith(filterValue);
      default:
        return stringValue.includes(filterValue);
    }
  }

  private applyNumberFilter(value: any, filter: any): boolean {
    const numValue = Number(value);
    const filterValue = Number(filter.filter);

    if (isNaN(numValue) || isNaN(filterValue)) return true;

    switch (filter.type) {
      case 'equals':
        return numValue === filterValue;
      case 'notEqual':
        return numValue !== filterValue;
      case 'lessThan':
        return numValue < filterValue;
      case 'lessThanOrEqual':
        return numValue <= filterValue;
      case 'greaterThan':
        return numValue > filterValue;
      case 'greaterThanOrEqual':
        return numValue >= filterValue;
      case 'inRange': {
        const filterTo = Number(filter.filterTo);
        return numValue >= filterValue && numValue <= filterTo;
      }
      default:
        return true;
    }
  }

  private applyDateFilter(value: any, filter: any): boolean {
    const dateValue = new Date(value);
    const filterDate = new Date(filter.dateFrom);

    if (isNaN(dateValue.getTime()) || isNaN(filterDate.getTime())) return true;

    switch (filter.type) {
      case 'equals':
        return dateValue.toDateString() === filterDate.toDateString();
      case 'notEqual':
        return dateValue.toDateString() !== filterDate.toDateString();
      case 'lessThan':
        return dateValue < filterDate;
      case 'greaterThan':
        return dateValue > filterDate;
      case 'inRange': {
        const filterTo = new Date(filter.dateTo);
        return dateValue >= filterDate && dateValue <= filterTo;
      }
      default:
        return true;
    }
  }

  private applySorting(
    data: Transaction[],
    sortModel: SortModelItem[]
  ): Transaction[] {
    return [...data].sort((a, b) => {
      for (const sort of sortModel) {
        const aValue = this.getFieldValue(a, sort.colId);
        const bValue = this.getFieldValue(b, sort.colId);

        let comparison = 0;

        // Handle different data types
        if (sort.colId === 'date') {
          comparison = new Date(aValue).getTime() - new Date(bValue).getTime();
        } else if (sort.colId === 'amount') {
          comparison = Number(aValue) - Number(bValue);
        } else {
          // String comparison
          const aStr = String(aValue || '').toLowerCase();
          const bStr = String(bValue || '').toLowerCase();
          comparison = aStr.localeCompare(bStr);
        }

        if (comparison !== 0) {
          return sort.sort === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  private updateDatasource(transactions: Transaction[]): void {
    // Use setTimeout to avoid AG Grid drawing race condition
    setTimeout(() => {
      if (this.gridApi) {
        this.gridApi.refreshInfiniteCache();
      }
    }, 0);
  }

  private updateColumnDefinitions(): void {
    // Update category column with new values
    const categoryColDef = this.columnDefs.find(
      (col) => col.field === 'category'
    );
    if (categoryColDef) {
      categoryColDef.cellEditorParams = {
        values: this.categories(),
      };
      categoryColDef.filterParams = {
        values: this.categories(),
      };
    }

    // Update the grid with new column definitions
    this.gridApi.setGridOption('columnDefs', this.columnDefs);
  }

  onCellEditingStopped(event: CellEditingStoppedEvent): void {
    if (event.valueChanged) {
      // For now, just emit the edit event so parent can handle updates
      this.editTransaction.emit(event.data);
    }
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

    const transaction = this.transactions().find((t) => t.id === id);
    if (transaction) {
      this.deleteTransaction.emit(transaction);
    }
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(amount);
  }

  private formatDate(date: string): string {
    if (!date) return '';
    return formatAbsoluteDate(date, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
