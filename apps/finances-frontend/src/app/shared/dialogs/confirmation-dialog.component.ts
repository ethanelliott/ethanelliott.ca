import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

export interface ConfirmationDialogData {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  requiresTextConfirmation?: boolean;
  confirmationText?: string;
  isDangerous?: boolean;
}

@Component({
  selector: 'app-confirmation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    FormsModule,
  ],
  template: `
    <div mat-dialog-content class="dialog-content">
      @if (data.title) {
      <h2 mat-dialog-title [class.dangerous]="data.isDangerous">
        @if (data.isDangerous) {
        <mat-icon>warning</mat-icon>
        }
        {{ data.title }}
      </h2>
      }
      <p>{{ data.message }}</p>

      @if (data.requiresTextConfirmation && data.confirmationText) {
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Type "{{ data.confirmationText }}" to confirm</mat-label>
        <input matInput [(ngModel)]="userInput" />
      </mat-form-field>
      }
    </div>
    <div mat-dialog-actions class="dialog-actions">
      <button mat-button (click)="cancel()">
        {{ data.cancelText || 'Cancel' }}
      </button>
      <button
        mat-raised-button
        [color]="data.isDangerous ? 'warn' : 'primary'"
        [disabled]="isConfirmDisabled()"
        (click)="confirm()"
      >
        {{ data.confirmText || 'Confirm' }}
      </button>
    </div>
  `,
  styles: [
    `
      .dialog-content {
        padding: 24px;
        min-width: 300px;
      }

      .dialog-actions {
        justify-content: flex-end;
        padding: 0 24px 24px;
        gap: 8px;
      }

      h2 {
        margin: 0 0 16px 0;
        font-size: 20px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      h2.dangerous {
        color: #f44336;
      }

      h2.dangerous mat-icon {
        color: #f44336;
      }

      p {
        margin: 0 0 16px 0;
        font-size: 16px;
        line-height: 1.5;
      }

      .full-width {
        width: 100%;
      }
    `,
  ],
})
export class ConfirmationDialogComponent {
  private _dialogRef = inject(MatDialogRef<ConfirmationDialogComponent>);

  data: ConfirmationDialogData = inject(MAT_DIALOG_DATA);
  userInput = signal('');

  isConfirmDisabled(): boolean {
    if (this.data.requiresTextConfirmation && this.data.confirmationText) {
      return this.userInput() !== this.data.confirmationText;
    }
    return false;
  }

  confirm(): void {
    this._dialogRef.close(true);
  }

  cancel(): void {
    this._dialogRef.close(false);
  }
}
