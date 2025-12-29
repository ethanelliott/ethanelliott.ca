import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import {
  AlertDialogComponent,
  AlertDialogData,
} from './alert-dialog.component';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from './confirmation-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class DialogService {
  private _dialog = inject(MatDialog);

  /**
   * Show an alert dialog (replaces browser alert)
   */
  alert(message: string, title?: string, icon?: string): Observable<void> {
    const dialogRef = this._dialog.open(AlertDialogComponent, {
      data: {
        message,
        title,
        icon,
      } as AlertDialogData,
      disableClose: false,
      width: 'auto',
      minWidth: '300px',
      maxWidth: '500px',
    });

    return dialogRef.afterClosed();
  }

  /**
   * Show a success alert with a checkmark icon
   */
  success(message: string, title?: string): Observable<void> {
    return this.alert(message, title, 'check_circle');
  }

  /**
   * Show an error alert with an error icon
   */
  error(message: string, title?: string): Observable<void> {
    return this.alert(message, title || 'Error', 'error');
  }

  /**
   * Show a warning alert with a warning icon
   */
  warning(message: string, title?: string): Observable<void> {
    return this.alert(message, title || 'Warning', 'warning');
  }

  /**
   * Show a simple confirmation dialog (replaces browser confirm)
   */
  confirm(
    message: string,
    title?: string,
    confirmText?: string,
    cancelText?: string
  ): Observable<boolean> {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        message,
        title,
        confirmText,
        cancelText,
      } as ConfirmationDialogData,
      disableClose: false,
      width: 'auto',
      minWidth: '300px',
      maxWidth: '500px',
    });

    return dialogRef.afterClosed();
  }

  /**
   * Show a dangerous confirmation dialog that requires typing a specific text
   */
  confirmDangerous(
    message: string,
    confirmationText = 'DELETE',
    title?: string,
    confirmText?: string,
    cancelText?: string
  ): Observable<boolean> {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        message,
        title,
        confirmText,
        cancelText,
        requiresTextConfirmation: true,
        confirmationText,
        isDangerous: true,
      } as ConfirmationDialogData,
      disableClose: false,
      width: 'auto',
      minWidth: '400px',
      maxWidth: '600px',
    });

    return dialogRef.afterClosed();
  }
}
