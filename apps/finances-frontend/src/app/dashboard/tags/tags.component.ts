import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import {
  FinanceApiService,
  Tag,
  TagUsage,
} from '../../services/finance-api.service';
import { DialogService } from '../../shared/dialogs';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-tags',
  standalone: true,
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
    MatTooltipModule,
    MatSnackBarModule,
  ],
  styleUrl: './tags.component.scss',
  template: `
    <div class="tags-container">
      <!-- Header -->
      <header class="header">
        <div class="header-row">
          <div class="title-section">
            <h1>Tags</h1>
            <p class="page-subtitle">Add extra labels to your transactions</p>
          </div>
          <div class="controls-section">
            <div class="search-box">
              <mat-icon>search</mat-icon>
              <input
                type="text"
                [formControl]="searchControl"
                placeholder="Search tags..."
              />
              @if (searchControl.value) {
              <button class="clear-btn" (click)="searchControl.reset()">
                <mat-icon>close</mat-icon>
              </button>
              }
            </div>
          </div>
        </div>
      </header>

      <!-- Quick Add Form -->
      <div class="quick-add-section">
        <form class="quick-add-form" (ngSubmit)="addTag()">
          <div class="color-picker-wrapper">
            <input
              type="color"
              [formControl]="colorControl"
              class="color-input"
              title="Choose tag color"
            />
          </div>
          <mat-form-field appearance="outline" class="name-input">
            <mat-label>New tag name</mat-label>
            <input
              matInput
              [formControl]="tagControl"
              placeholder="e.g. Subscription, Business expense..."
            />
          </mat-form-field>
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="!tagControl.valid || submitting()"
            class="add-button"
          >
            @if (submitting()) {
            <mat-spinner diameter="18"></mat-spinner>
            } @else {
            <mat-icon>add</mat-icon>
            Add
            }
          </button>
        </form>
      </div>

      @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="40"></mat-spinner>
        <span>Loading tags...</span>
      </div>
      } @else {
      <!-- Stats Bar -->
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-value">{{ tags().length }}</span>
          <span class="stat-label">Total Tags</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ getTotalTransactions() }}</span>
          <span class="stat-label">Tagged</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ getActiveCount() }}</span>
          <span class="stat-label">In Use</span>
        </div>
      </div>

      <!-- Tags Grid -->
      @if (filteredTags().length === 0) {
      <div class="empty-state">
        @if (searchControl.value) {
        <mat-icon>search_off</mat-icon>
        <h3>No matches found</h3>
        <p>Try a different search term</p>
        } @else {
        <mat-icon>sell</mat-icon>
        <h3>No Tags Yet</h3>
        <p>Create tags to add additional organization to your transactions</p>
        }
      </div>
      } @else {
      <div class="tags-grid">
        @for (tag of filteredTags(); track tag.id) {
        <div
          class="tag-card"
          [class.expanded]="expandedTagId() === tag.id"
        >
          <!-- Tag Header (always visible) -->
          <div class="tag-header" (click)="toggleExpand(tag)">
            <div
              class="color-indicator"
              [style.background-color]="tag.color || '#6366f1'"
            ></div>
            <div class="tag-info">
              <span class="tag-name">{{ tag.name }}</span>
              @if (getUsageCount(tag.id); as count) {
              <span class="usage-count">{{ count }} transactions</span>
              }
            </div>
            <mat-icon class="expand-icon">
              {{
                expandedTagId() === tag.id
                  ? 'expand_less'
                  : 'expand_more'
              }}
            </mat-icon>
          </div>

          <!-- Expanded Content -->
          @if (expandedTagId() === tag.id) {
          <div class="tag-details">
            <div class="edit-section">
              <div class="edit-row">
                <label>Color</label>
                <div class="color-edit">
                  <input
                    type="color"
                    [value]="tag.color || '#6366f1'"
                    (change)="updateColor(tag, $event)"
                    class="edit-color-input"
                  />
                  <span class="color-hex">{{
                    tag.color || '#6366f1'
                  }}</span>
                </div>
              </div>

              <div class="edit-row">
                <label>Name</label>
                <div class="name-edit">
                  @if (editingTagId() === tag.id) {
                  <input
                    type="text"
                    [formControl]="editNameControl"
                    class="edit-name-input"
                    (keydown.enter)="saveEdit(tag)"
                    (keydown.escape)="cancelEdit()"
                  />
                  <button
                    class="save-btn"
                    (click)="saveEdit(tag)"
                    [disabled]="!editNameControl.valid"
                  >
                    <mat-icon>check</mat-icon>
                  </button>
                  <button class="cancel-btn" (click)="cancelEdit()">
                    <mat-icon>close</mat-icon>
                  </button>
                  } @else {
                  <span class="current-name">{{ tag.name }}</span>
                  <button
                    class="edit-btn"
                    (click)="editTag(tag); $event.stopPropagation()"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  }
                </div>
              </div>

              @if (tag.description) {
              <div class="edit-row">
                <label>Description</label>
                <span class="description">{{ tag.description }}</span>
              </div>
              }
            </div>

            <div class="action-buttons">
              <button
                mat-stroked-button
                (click)="viewTransactions(tag)"
                class="view-btn"
              >
                <mat-icon>receipt_long</mat-icon>
                View Transactions
              </button>
              <button
                mat-stroked-button
                color="warn"
                (click)="deleteTag(tag)"
                [disabled]="deleting().has(tag.id)"
                class="delete-btn"
              >
                @if (deleting().has(tag.id)) {
                <mat-spinner diameter="18"></mat-spinner>
                } @else {
                <mat-icon>delete</mat-icon>
                Delete
                }
              </button>
            </div>
          </div>
          }
        </div>
        }
      </div>
      }
      }
    </div>
  `,
})
export class TagsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);
  private readonly router = inject(Router);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal<Set<string>>(new Set());
  tags = signal<Tag[]>([]);
  tagUsage = signal<TagUsage[]>([]);
  expandedTagId = signal<string | null>(null);
  editingTagId = signal<string | null>(null);

  searchControl = new FormControl('');
  editNameControl = new FormControl('', [
    Validators.required,
    Validators.minLength(2),
  ]);
  tagControl = new FormControl('', [
    Validators.required,
    Validators.minLength(2),
    Validators.maxLength(50),
  ]);
  colorControl = new FormControl('#6366f1');

  filteredTags = computed(() => {
    const search = this.searchControl.value?.toLowerCase() || '';
    const allTags = this.tags();
    if (!search) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(search));
  });

  ngOnInit() {
    this.loadData();
    this.searchControl.valueChanges.subscribe(() => {
      // Reset expanded state on search
      this.expandedTagId.set(null);
    });
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const [tags, usage] = await Promise.all([
        firstValueFrom(this.apiService.getAllTags()),
        firstValueFrom(this.apiService.getTagUsage()),
      ]);
      this.tags.set(tags);
      this.tagUsage.set(usage);
    } catch (error) {
      console.error('Error loading tags:', error);
      this.snackBar.open('Failed to load tags', 'Dismiss', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  getTotalTransactions(): number {
    return this.tagUsage().reduce((sum, u) => sum + u.transactionCount, 0);
  }

  getActiveCount(): number {
    return this.tagUsage().filter((u) => u.transactionCount > 0).length;
  }

  getUsageCount(tagId: string): number {
    return (
      this.tagUsage().find((u) => u.tagId === tagId)?.transactionCount || 0
    );
  }

  toggleExpand(tag: Tag) {
    if (this.expandedTagId() === tag.id) {
      this.expandedTagId.set(null);
      this.cancelEdit();
    } else {
      this.expandedTagId.set(tag.id);
      this.cancelEdit();
    }
  }

  async addTag() {
    if (!this.tagControl.valid) return;

    try {
      this.submitting.set(true);
      await firstValueFrom(
        this.apiService.createTag({
          name: this.tagControl.value!,
          color: this.colorControl.value || undefined,
        })
      );
      this.tagControl.reset();
      this.loadData();
      this.snackBar.open('Tag added', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error adding tag:', error);
      this.snackBar.open('Failed to add tag', 'Dismiss', { duration: 3000 });
    } finally {
      this.submitting.set(false);
    }
  }

  async updateColor(tag: Tag, event: Event) {
    const input = event.target as HTMLInputElement;
    const newColor = input.value;

    if (newColor === tag.color) return;

    try {
      await firstValueFrom(
        this.apiService.updateTag(tag.id, { color: newColor })
      );
      // Update local state immediately
      this.tags.update((tags) =>
        tags.map((t) => (t.id === tag.id ? { ...t, color: newColor } : t))
      );
      this.snackBar.open('Color updated', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error updating color:', error);
      this.snackBar.open('Failed to update color', 'Dismiss', {
        duration: 3000,
      });
    }
  }

  editTag(tag: Tag) {
    this.editingTagId.set(tag.id);
    this.editNameControl.setValue(tag.name);
  }

  cancelEdit() {
    this.editingTagId.set(null);
    this.editNameControl.reset();
  }

  async saveEdit(tag: Tag) {
    const newName = this.editNameControl.value?.trim();
    if (!newName || newName === tag.name) {
      this.cancelEdit();
      return;
    }

    try {
      await firstValueFrom(
        this.apiService.updateTag(tag.id, { name: newName })
      );
      this.tags.update((tags) =>
        tags.map((t) => (t.id === tag.id ? { ...t, name: newName } : t))
      );
      this.snackBar.open('Tag updated', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error updating tag:', error);
      this.snackBar.open('Failed to update tag', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.cancelEdit();
    }
  }

  viewTransactions(tag: Tag) {
    this.router.navigate(['/dashboard/transactions'], {
      queryParams: { tag: tag.name },
    });
  }

  async deleteTag(tag: Tag) {
    const confirmed = await firstValueFrom(
      this.dialogService.confirm(
        `Are you sure you want to delete "${tag.name}"? This will remove the tag from all transactions.`,
        'Delete Tag',
        'Delete',
        'Cancel'
      )
    );

    if (!confirmed) return;

    const newDeleting = new Set(this.deleting());
    newDeleting.add(tag.id);
    this.deleting.set(newDeleting);

    try {
      await firstValueFrom(this.apiService.deleteTag(tag.id));
      this.tags.update((t) => t.filter((x) => x.id !== tag.id));
      this.expandedTagId.set(null);
      this.snackBar.open('Tag deleted', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error deleting tag:', error);
      this.snackBar.open('Failed to delete tag', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      const updatedDeleting = new Set(this.deleting());
      updatedDeleting.delete(tag.id);
      this.deleting.set(updatedDeleting);
    }
  }
}
