import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { FinanceApiService } from '../../services/finance-api.service';

@Component({
  selector: 'app-tags',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatChipsModule,
  ],
  template: `
    <div class="tags-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h1 class="page-title">Tags</h1>
          <p class="page-subtitle">
            Create custom tags to organize and filter your transactions
          </p>
        </div>
      </div>

      <!-- Add Tag Form -->
      <mat-card class="add-tag-card">
        <mat-card-header>
          <mat-card-title>Add New Tag</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="tagForm" class="tag-form">
            <mat-form-field appearance="outline" class="tag-name-field">
              <mat-label>Tag Name</mat-label>
              <input
                matInput
                formControlName="name"
                required
                placeholder="e.g., urgent, business, recurring"
              />
            </mat-form-field>
            <button
              mat-raised-button
              color="primary"
              (click)="addTag()"
              [disabled]="!tagForm.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
              Add Tag } @else {
              <ng-container>
                <mat-icon>add</mat-icon>
                Add Tag
              </ng-container>
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Tags Display -->
      <mat-card class="tags-list-card">
        <mat-card-header>
          <mat-card-title>All Tags</mat-card-title>
          <mat-card-subtitle
            >{{ tags().length }} tags available</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          @if (loading()) {
          <div class="loading-container">
            <mat-spinner></mat-spinner>
            <p>Loading tags...</p>
          </div>
          } @else if (tags().length === 0) {
          <div class="empty-state">
            <mat-icon>local_offer</mat-icon>
            <h3>No tags yet</h3>
            <p>
              Add your first tag above to start organizing your transactions
            </p>
          </div>
          } @else {
          <div class="tags-container-chips">
            @for (tag of tags(); track tag) {
            <div class="tag-chip-container">
              <mat-chip class="tag-chip" [disabled]="deleting().has(tag)">
                <mat-icon matChipAvatar>local_offer</mat-icon>
                {{ tag }}
                <button
                  matChipRemove
                  (click)="deleteTag(tag)"
                  [disabled]="deleting().has(tag)"
                  class="remove-button"
                >
                  @if (deleting().has(tag)) {
                  <mat-spinner diameter="16"></mat-spinner>
                  } @else {
                  <mat-icon>cancel</mat-icon>
                  }
                </button>
              </mat-chip>
            </div>
            }
          </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- Quick Add Suggestions -->
      <mat-card class="suggestions-card">
        <mat-card-header>
          <mat-card-title>Common Tags</mat-card-title>
          <mat-card-subtitle
            >Click to quickly add popular tags</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <div class="suggestions-chips">
            @for (suggestion of commonTags; track suggestion) {
            <mat-chip
              (click)="addSuggestedTag(suggestion)"
              [disabled]="tags().includes(suggestion) || submitting()"
              class="suggestion-chip"
            >
              <mat-icon matChipAvatar>add</mat-icon>
              {{ suggestion }}
            </mat-chip>
            }
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .tags-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 16px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      font-size: 2rem;
      font-weight: 400;
      margin: 0;
      color: var(--mat-sys-primary);
    }

    .page-subtitle {
      color: var(--mat-sys-on-surface-variant);
      margin: 4px 0 0 0;
    }

    .add-tag-card {
      margin-bottom: 24px;
      border: 2px solid var(--mat-sys-primary);
    }

    .tag-form {
      display: flex;
      gap: 16px;
      align-items: flex-end;
    }

    .tag-name-field {
      flex: 1;
    }

    .add-button {
      gap: 8px;
      min-width: 120px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      gap: 16px;
    }

    .empty-state {
      text-align: center;
      padding: 64px 32px;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state h3 {
      margin: 16px 0 8px 0;
      color: var(--mat-primary-text-color);
    }

    .tags-container-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 16px 0;
    }

    .tag-chip-container {
      display: inline-block;
    }

    .tag-chip {
      font-size: 0.9rem;
      padding: 8px 12px;
      border-radius: 16px;
      background: var(--mat-primary-container-color);
      color: var(--mat-on-primary-container-color);
      border: 1px solid var(--mat-sys-primary);
      transition: all 0.2s ease;
    }

    .tag-chip:not([disabled]):hover {
      background: var(--mat-sys-primary);
      color: var(--mat-on-primary-color);
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .tag-chip[disabled] {
      opacity: 0.6;
    }

    .remove-button {
      margin-left: 8px;
      color: inherit;
    }

    .suggestions-card {
      margin-bottom: 24px;
    }

    .suggestions-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .suggestion-chip {
      cursor: pointer;
      transition: all 0.2s ease;
      background: var(--mat-surface-variant-color);
      border: 1px dashed var(--mat-outline-color);
    }

    .suggestion-chip:not([disabled]):hover {
      background: var(--mat-primary-container-color);
      color: var(--mat-on-primary-container-color);
      border-color: var(--mat-sys-primary);
      transform: translateY(-1px);
    }

    .suggestion-chip[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .tag-form {
        flex-direction: column;
        align-items: stretch;
      }

      .add-button {
        margin-top: 16px;
      }

      .tags-container-chips,
      .suggestions-chips {
        justify-content: center;
      }
    }
  `,
})
export class TagsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal(new Set<string>());
  tags = signal<string[]>([]);

  tagForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  commonTags = [
    'urgent',
    'business',
    'personal',
    'recurring',
    'one-time',
    'planned',
    'unexpected',
    'essential',
    'luxury',
    'investment',
    'debt',
    'savings',
    'emergency',
    'tax-deductible',
    'reimbursable',
    'gift',
    'subscription',
    'utility',
    'maintenance',
    'health',
  ];

  ngOnInit() {
    this.loadTags();
  }

  private loadTags() {
    this.apiService.getAllTags().subscribe({
      next: (tags) => {
        this.tags.set(tags);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading tags:', error);
        this.loading.set(false);
        this.snackBar.open('Error loading tags', 'Close', { duration: 3000 });
      },
    });
  }

  addTag() {
    if (!this.tagForm.valid) return;

    this.submitting.set(true);
    const tagName = this.tagForm.value.name.trim().toLowerCase();

    this.apiService.createTag({ name: tagName }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open('Tag added successfully', 'Close', {
          duration: 3000,
        });
        this.tagForm.reset();
        this.loadTags();
      },
      error: (error) => {
        console.error('Error adding tag:', error);
        this.submitting.set(false);
        this.snackBar.open('Error adding tag', 'Close', { duration: 3000 });
      },
    });
  }

  addSuggestedTag(tagName: string) {
    this.submitting.set(true);

    this.apiService.createTag({ name: tagName }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(`"${tagName}" tag added successfully`, 'Close', {
          duration: 3000,
        });
        this.loadTags();
      },
      error: (error) => {
        console.error('Error adding suggested tag:', error);
        this.submitting.set(false);
        this.snackBar.open('Error adding tag', 'Close', { duration: 3000 });
      },
    });
  }

  deleteTag(tagName: string) {
    if (!confirm(`Are you sure you want to delete the tag "${tagName}"?`))
      return;

    // Add to deleting set
    const newDeleting = new Set(this.deleting());
    newDeleting.add(tagName);
    this.deleting.set(newDeleting);

    this.apiService.deleteTag(tagName).subscribe({
      next: () => {
        // Remove from deleting set
        const updatedDeleting = new Set(this.deleting());
        updatedDeleting.delete(tagName);
        this.deleting.set(updatedDeleting);

        this.snackBar.open('Tag deleted successfully', 'Close', {
          duration: 3000,
        });
        this.loadTags();
      },
      error: (error) => {
        console.error('Error deleting tag:', error);

        // Remove from deleting set on error too
        const updatedDeleting = new Set(this.deleting());
        updatedDeleting.delete(tagName);
        this.deleting.set(updatedDeleting);

        this.snackBar.open('Error deleting tag', 'Close', { duration: 3000 });
      },
    });
  }
}
