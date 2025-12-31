
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
} from 'ag-grid-community';
import { Transfer, Account } from '../../services/finance-api.service';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';
import { formatAbsoluteDate } from '../../utils/date-utils';
import {
  ActionsCellRendererComponent,
  ActionsCellRendererParams,
} from '../transactions/actions-cell-renderer.component';

// Register AG Grid modules
ModuleRegistry.registerModules([InfiniteRowModelModule, AllCommunityModule]);

@Component({
  selector: 'app-transfers-grid',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, AgGridAngular],
  template: `
    <ag-grid-angular
      class="transfers-grid"
      [columnDefs]="columnDefs"
      [gridOptions]="gridOptions"
      animateRows="true"
      enableStatusBar="true"
      (gridReady)="onGridReady($event)"
      (cellEditingStopped)="onCellEditingStopped($event)"
    ></ag-grid-angular>
  `,
  styles: `
    .transfers-grid {
      width: 100%;
      height: 600px; /* Fixed height for infinite scroll */
      border-radius: 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      box-shadow: var(--mat-sys-elevation-1);
    }
  `,
})
export class TransfersGridComponent {
  private readonly dialogService = inject(DialogService);
  private readonly breakpointObserver = inject(BreakpointObserver);

  isMobile = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset])
      .pipe(map((result) => result.matches)),
    { initialValue: false }
  );

  // Inputs
  transfers = input.required<Transfer[]>();
  accounts = input<Account[]>([]);

  // Outputs
  editTransfer = output<Transfer>();
  deleteTransfer = output<Transfer>();

  private gridApi!: GridApi;
  private datasource!: IDatasource;

  constructor() {
    // Use effect to watch for changes in transfers and update datasource
    effect(() => {
      const currentTransfers = this.transfers();
      if (this.gridApi && this.datasource && currentTransfers) {
        this.updateDatasource(currentTransfers);
      }
    });

    // Effect to update column definitions when accounts change
    effect(() => {
      const accounts = this.accounts();

      if (this.gridApi && accounts.length > 0) {
        this.updateColumnDefinitions();
      }
    });

    // Effect to handle mobile responsiveness
    effect(() => {
      const isMobile = this.isMobile();
      if (this.gridApi) {
        const columnsToHide = [
          'transferType',
          'fromAccount.name',
          'toAccount.name',
        ];
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
      field: 'transferType',
      width: 120,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['INTERNAL', 'EXTERNAL', 'DEPOSIT', 'WITHDRAWAL'],
      },
      cellStyle: (params) => {
        switch (params.value) {
          case 'INTERNAL':
            return { color: 'var(--mat-sys-primary)', fontWeight: '600' };
          case 'EXTERNAL':
            return { color: 'var(--mat-sys-secondary)', fontWeight: '600' };
          case 'DEPOSIT':
            return { color: 'var(--mat-sys-tertiary)', fontWeight: '600' };
          case 'WITHDRAWAL':
            return { color: 'var(--mat-sys-error)', fontWeight: '600' };
          default:
            return null;
        }
      },
      valueFormatter: (params: ValueFormatterParams) => {
        const type = params.value;
        return type ? type.charAt(0) + type.slice(1).toLowerCase() : '';
      },
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
      cellClass: 'transfer-amount',
      cellStyle: { color: 'var(--mat-sys-primary)', fontWeight: '700' },
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.data || !params.value) return '';
        return this.formatCurrency(params.value);
      },
      valueSetter: (params) => {
        params.data.amount = parseFloat(params.newValue);
        return true;
      },
    },
    {
      headerName: 'From Account',
      field: 'fromAccount.name',
      width: 150,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: false, // Account changes require selecting from dropdown in dialog
    },
    {
      headerName: 'To Account',
      field: 'toAccount.name',
      width: 150,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: false, // Account changes require selecting from dropdown in dialog
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
        onEdit: (data: Transfer) => this.onEditTransfer(data),
        onDelete: (id: string) => this.onDeleteTransfer(id),
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
    const columnsToHide = [
      'transferType',
      'fromAccount.name',
      'toAccount.name',
    ];
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
        const transfers = this.transfers();

        // Apply filtering
        let filteredData = this.applyFiltering(transfers, params.filterModel);

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
    data: Transfer[],
    filterModel: FilterModel | undefined
  ): Transfer[] {
    if (!filterModel) return data;

    return data.filter((transfer) => {
      for (const [field, filter] of Object.entries(filterModel)) {
        if (!this.doesTransferPassFilter(transfer, field, filter)) {
          return false;
        }
      }
      return true;
    });
  }

  private doesTransferPassFilter(
    transfer: Transfer,
    field: string,
    filter: any
  ): boolean {
    const fieldValue = this.getFieldValue(transfer, field);

    switch (filter.type) {
      case 'contains':
        return String(fieldValue)
          .toLowerCase()
          .includes(filter.filter.toLowerCase());
      case 'equals':
        return fieldValue === filter.filter;
      case 'notEqual':
        return fieldValue !== filter.filter;
      case 'startsWith':
        return String(fieldValue)
          .toLowerCase()
          .startsWith(filter.filter.toLowerCase());
      case 'endsWith':
        return String(fieldValue)
          .toLowerCase()
          .endsWith(filter.filter.toLowerCase());
      case 'greaterThan':
        return Number(fieldValue) > Number(filter.filter);
      case 'lessThan':
        return Number(fieldValue) < Number(filter.filter);
      case 'greaterThanOrEqual':
        return Number(fieldValue) >= Number(filter.filter);
      case 'lessThanOrEqual':
        return Number(fieldValue) <= Number(filter.filter);
      case 'inRange': {
        const numValue = Number(fieldValue);
        return (
          numValue >= Number(filter.filter) &&
          numValue <= Number(filter.filterTo)
        );
      }
      case 'dateEquals': {
        const transferDate = new Date(fieldValue).toDateString();
        const filterDate = new Date(filter.dateFrom).toDateString();
        return transferDate === filterDate;
      }
      case 'dateNotEqual': {
        const transferDateNE = new Date(fieldValue).toDateString();
        const filterDateNE = new Date(filter.dateFrom).toDateString();
        return transferDateNE !== filterDateNE;
      }
      case 'dateBefore':
        return new Date(fieldValue) < new Date(filter.dateFrom);
      case 'dateAfter':
        return new Date(fieldValue) > new Date(filter.dateFrom);
      case 'dateRange': {
        const dateValue = new Date(fieldValue);
        const filterFromDate = new Date(filter.dateFrom);
        const filterToDate = new Date(filter.dateTo);
        return dateValue >= filterFromDate && dateValue <= filterToDate;
      }
      default:
        return true;
    }
  }

  private getFieldValue(transfer: Transfer, field: string): any {
    // Handle nested field access (e.g., 'fromAccount.name')
    const fields = field.split('.');
    let value: any = transfer;

    for (const f of fields) {
      value = value?.[f];
      if (value === undefined || value === null) break;
    }

    return value;
  }

  private applySorting(
    data: Transfer[],
    sortModel: SortModelItem[]
  ): Transfer[] {
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

  private updateDatasource(transfers: Transfer[]): void {
    // Use setTimeout to avoid AG Grid drawing race condition
    setTimeout(() => {
      if (this.gridApi) {
        this.gridApi.refreshInfiniteCache();
      }
    }, 0);
  }

  private updateColumnDefinitions(): void {
    // Update account columns with new values
    const fromAccountColDef = this.columnDefs.find(
      (col) => col.field === 'fromAccount.name'
    );
    const toAccountColDef = this.columnDefs.find(
      (col) => col.field === 'toAccount.name'
    );

    if (fromAccountColDef) {
      fromAccountColDef.filterParams = {
        values: this.accounts().map((a) => a.name),
      };
    }

    if (toAccountColDef) {
      toAccountColDef.filterParams = {
        values: this.accounts().map((a) => a.name),
      };
    }

    // Update the grid with new column definitions
    this.gridApi.setGridOption('columnDefs', this.columnDefs);
  }

  onCellEditingStopped(event: CellEditingStoppedEvent): void {
    if (event.valueChanged) {
      // For now, just emit the edit event so parent can handle updates
      this.editTransfer.emit(event.data);
    }
  }

  private onEditTransfer(transfer: Transfer): void {
    this.editTransfer.emit(transfer);
  }

  private async onDeleteTransfer(id: string): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialogService.confirm(
        'Are you sure you want to delete this transfer?',
        'Delete Transfer',
        'Delete',
        'Cancel'
      )
    );

    if (!confirmed) return;

    const transfer = this.transfers().find((t) => t.id === id);
    if (transfer) {
      this.deleteTransfer.emit(transfer);
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
