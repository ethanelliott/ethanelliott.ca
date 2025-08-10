import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { map, startWith } from 'rxjs/operators';
import { Observable } from 'rxjs';
import {
  FinanceApiService,
  Transaction,
} from '../../services/finance-api.service';
import { TransactionsService } from '../../services/transactions.service';

export interface TransactionDialogData {
  transaction?: Transaction;
  categories: string[];
  mediums: string[];
  tags: string[];
}

@Component({
  selector: 'app-transaction-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="dialog-header">
      <h2 mat-dialog-title>
        {{ data.transaction ? 'Edit Transaction' : 'Add New Transaction' }}
      </h2>
      <button mat-icon-button mat-dialog-close>
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <div mat-dialog-content class="dialog-content">
      <form [formGroup]="transactionForm" class="transaction-form">
        <div class="form-row">
          <mat-form-field appearance="outline" class="type-field">
            <mat-label>Type</mat-label>
            <mat-select formControlName="type" required>
              <mat-option value="INCOME">Income</mat-option>
              <mat-option value="EXPENSE">Expense</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="amount-field">
            <mat-label>Amount</mat-label>
            <input
              matInput
              type="number"
              formControlName="amount"
              required
              min="0"
              step="0.01"
            />
            <span matTextPrefix>$</span>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="category-field">
            <mat-label>Category</mat-label>
            <input
              matInput
              formControlName="category"
              [matAutocomplete]="categoryAuto"
              required
              placeholder="Enter or select category"
            />
            <mat-autocomplete #categoryAuto="matAutocomplete">
              @for (category of filteredCategories | async; track category) {
              <mat-option [value]="category">{{ category }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>

          <mat-form-field appearance="outline" class="medium-field">
            <mat-label>Payment Method</mat-label>
            <input
              matInput
              formControlName="medium"
              [matAutocomplete]="mediumAuto"
              required
              placeholder="Enter or select payment method"
            />
            <mat-autocomplete #mediumAuto="matAutocomplete">
              @for (medium of filteredMediums | async; track medium) {
              <mat-option [value]="medium">{{ medium }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="date-field">
            <mat-label>Date</mat-label>
            <input matInput type="date" formControlName="date" required />
          </mat-form-field>

          <mat-form-field appearance="outline" class="tags-field">
            <mat-label>Tags</mat-label>
            <mat-chip-grid #chipGrid>
              @for (tag of selectedTags(); track tag) {
              <mat-chip-row (removed)="removeTag(tag)">
                {{ tag }}
                <button matChipRemove>
                  <mat-icon>cancel</mat-icon>
                </button>
              </mat-chip-row>
              }
            </mat-chip-grid>
            <input
              matInput
              formControlName="tagInput"
              [matAutocomplete]="tagAuto"
              [matChipInputFor]="chipGrid"
              placeholder="Add tags..."
              (keydown)="addTag($event)"
            />
            <mat-autocomplete
              #tagAuto="matAutocomplete"
              (optionSelected)="addTagFromAutocomplete($event)"
            >
              @for (tag of filteredTags | async; track tag) {
              <mat-option [value]="tag">{{ tag }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="description-field">
          <mat-label>Description</mat-label>
          <textarea
            matInput
            formControlName="description"
            required
            rows="3"
          ></textarea>
        </mat-form-field>
      </form>
    </div>

    <div mat-dialog-actions class="dialog-actions">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-raised-button
        color="primary"
        (click)="saveTransaction()"
        [disabled]="!transactionForm.valid || submitting()"
        class="save-button"
      >
        @if (submitting()) {
        <mat-spinner diameter="20"></mat-spinner>
        } @else {
        {{ data.transaction ? 'Update' : 'Save' }} Transaction }
      </button>
    </div>
  `,
  styles: `
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: -24px -24px 0 -24px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .dialog-header h2 {
      margin: 0;
      color: var(--mat-sys-primary);
    }

    .dialog-content {
      padding-top: 24px;
      min-width: 500px;
    }

    .transaction-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: flex;
      gap: 16px;
    }

    .form-row > * {
      flex: 1;
    }

    .description-field {
      width: 100%;
    }

    .tags-field mat-chip-grid {
      margin-bottom: 8px;
    }

    .tags-field mat-chip-row {
      margin: 2px;
    }

    mat-autocomplete {
      max-height: 200px;
    }

    .dialog-actions {
      gap: 12px;
      margin-top: 24px;
      justify-content: flex-end;
    }

    .save-button {
      min-width: 120px;
    }

    @media (max-width: 768px) {
      .dialog-content {
        min-width: auto;
        max-width: 90vw;
      }

      .form-row {
        flex-direction: column;
      }
    }
  `,
})
export class TransactionDialogComponent implements OnInit {
  private readonly transactionsService = inject(TransactionsService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<TransactionDialogComponent>);

  readonly data: TransactionDialogData = inject(MAT_DIALOG_DATA);
  submitting = signal(false);
  selectedTags = signal<string[]>([]);

  // Filtered observables for autocomplete
  filteredCategories!: Observable<string[]>;
  filteredMediums!: Observable<string[]>;
  filteredTags!: Observable<string[]>;

  transactionForm: FormGroup = this.fb.group({
    type: ['EXPENSE', Validators.required],
    amount: ['', [Validators.required, Validators.min(0.01)]],
    category: ['', Validators.required],
    medium: ['', Validators.required],
    date: [new Date().toISOString().split('T')[0], Validators.required],
    tagInput: [''],
    description: ['', Validators.required],
  });

  ngOnInit() {
    // Set up autocomplete filtering
    this.filteredCategories = this.transactionForm
      .get('category')!
      .valueChanges.pipe(
        startWith(''),
        map((value) => this._filterOptions(value || '', this.data.categories))
      );

    this.filteredMediums = this.transactionForm
      .get('medium')!
      .valueChanges.pipe(
        startWith(''),
        map((value) => this._filterOptions(value || '', this.data.mediums))
      );

    this.filteredTags = this.transactionForm.get('tagInput')!.valueChanges.pipe(
      startWith(''),
      map((value) => this._filterOptions(value || '', this.data.tags))
    );

    if (this.data.transaction) {
      // Editing existing transaction
      const transaction = this.data.transaction;
      this.selectedTags.set([...transaction.tags]);

      this.transactionForm.patchValue({
        type: transaction.type,
        amount: transaction.amount,
        category: transaction.category,
        medium: transaction.medium,
        date: transaction.date,
        description: transaction.description,
      });
    }
  }

  private _filterOptions(value: string, options: string[]): string[] {
    const filterValue = value.toLowerCase();
    return options.filter((option) =>
      option.toLowerCase().includes(filterValue)
    );
  }

  addTag(event: KeyboardEvent) {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();

    if ((event.key === 'Enter' || event.key === ',') && value) {
      event.preventDefault();
      if (!this.selectedTags().includes(value)) {
        this.selectedTags.update((tags) => [...tags, value]);
      }
      input.value = '';
      this.transactionForm.get('tagInput')?.setValue('');
    }
  }

  addTagFromAutocomplete(event: any) {
    const value = event.option.value;
    if (!this.selectedTags().includes(value)) {
      this.selectedTags.update((tags) => [...tags, value]);
    }
    this.transactionForm.get('tagInput')?.setValue('');
  }

  removeTag(tag: string) {
    this.selectedTags.update((tags) => tags.filter((t) => t !== tag));
  }

  saveTransaction() {
    if (!this.transactionForm.valid) return;

    this.submitting.set(true);
    const formValue = this.transactionForm.value;

    const transaction = {
      type: formValue.type,
      amount: parseFloat(formValue.amount),
      category: formValue.category,
      medium: formValue.medium,
      date: formValue.date,
      tags: this.selectedTags(),
      description: formValue.description,
    };

    const operation = this.data.transaction
      ? this.transactionsService.updateTransaction(
          this.data.transaction.id!,
          transaction
        )
      : this.transactionsService.createTransaction(transaction);

    operation.subscribe({
      next: (success) => {
        this.submitting.set(false);
        this.dialogRef.close({ success });
      },
      error: () => {
        this.submitting.set(false);
        this.dialogRef.close({ error: true });
      },
    });
  }
}
