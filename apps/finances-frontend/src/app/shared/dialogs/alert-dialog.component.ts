import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface AlertDialogData {
  title?: string;
  message: string;
  icon?: string;
  buttonText?: string;
}

@Component({
  selector: 'app-alert-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div mat-dialog-content class="dialog-content">
      @if (data.icon) {
      <div class="dialog-icon">
        <mat-icon>{{ data.icon }}</mat-icon>
      </div>
      } @if (data.title) {
      <h2 mat-dialog-title>{{ data.title }}</h2>
      }
      <p>{{ data.message }}</p>
    </div>
    <div mat-dialog-actions class="dialog-actions">
      <button mat-raised-button color="primary" (click)="close()">
        {{ data.buttonText || 'OK' }}
      </button>
    </div>
  `,
  styles: [
    `
      .dialog-content {
        text-align: center;
        padding: 24px;
        min-width: 300px;
      }

      .dialog-icon {
        margin-bottom: 16px;
      }

      .dialog-icon mat-icon {
        font-size: 48px;
        height: 48px;
        width: 48px;
        color: #4caf50;
      }

      .dialog-actions {
        justify-content: center;
        padding: 0 24px 24px;
      }

      h2 {
        margin: 0 0 16px 0;
        font-size: 20px;
        font-weight: 500;
      }

      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.5;
      }
    `,
  ],
})
export class AlertDialogComponent {
  private _dialogRef = inject(MatDialogRef<AlertDialogComponent>);

  data: AlertDialogData = inject(MAT_DIALOG_DATA);

  close(): void {
    this._dialogRef.close();
  }
}
