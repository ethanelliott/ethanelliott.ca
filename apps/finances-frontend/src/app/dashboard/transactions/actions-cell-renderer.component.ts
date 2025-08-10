import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

export interface ActionsCellRendererParams extends ICellRendererParams {
  onEdit: (data: any) => void;
  onDelete: (id: string) => void;
}

@Component({
  selector: 'app-actions-cell-renderer',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="actions-container">
      <button
        mat-icon-button
        color="primary"
        (click)="onEdit()"
        [attr.aria-label]="'Edit transaction'"
        title="Edit"
      >
        <mat-icon>edit</mat-icon>
      </button>
      <button
        mat-icon-button
        color="warn"
        (click)="onDelete()"
        [attr.aria-label]="'Delete transaction'"
        title="Delete"
      >
        <mat-icon>delete</mat-icon>
      </button>
    </div>
  `,
  styles: `
    .actions-container {
      display: flex;
      gap: 4px;
      align-items: center;
      height: 100%;
      justify-content: center;
    }
  `,
})
export class ActionsCellRendererComponent implements ICellRendererAngularComp {
  private params!: ActionsCellRendererParams;

  agInit(params: ActionsCellRendererParams): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  onEdit(): void {
    if (this.params.onEdit) {
      this.params.onEdit(this.params.data);
    }
  }

  onDelete(): void {
    if (this.params.onDelete && this.params.data.id) {
      this.params.onDelete(this.params.data.id);
    }
  }
}
