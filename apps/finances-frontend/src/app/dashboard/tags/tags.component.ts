import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
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
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  styleUrl: './tags.component.scss',
  template: `
    <div class="tags-container">
      <div class="header">
        <div class="header-row">
          <div class="title-section">
            <p class="page-subtitle">
              Add custom tags to organize your transactions
            </p>
          </div>
          <div class="controls-section">
            <div class="header-stats">
              <div class="stat-chip">
                <mat-icon>sell</mat-icon>
                <span>{{ tags().length }} Tags</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Add Form -->
      <mat-card class="quick-add-card">
        <mat-card-content>
          <div class="quick-add-form">
            <mat-form-field appearance="outline" class="tag-input">
              <mat-label>Add New Tag</mat-label>
              <input
                matInput
                [formControl]="tagControl"
                placeholder="e.g., Vacation, Home Improvement"
                (keydown.enter)="addTag()"
              />
              <mat-icon matSuffix>sell</mat-icon>
            </mat-form-field>
            <div class="color-picker">
              <input
                type="color"
                [formControl]="colorControl"
                class="color-input"
              />
            </div>
            <button
              mat-raised-button
              color="primary"
              (click)="addTag()"
              [disabled]="!tagControl.valid || submitting()"
              class="add-button"
            >
              @if (submitting()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <mat-icon>add</mat-icon>
                Add Tag
              }
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <h3>Loading Tags</h3>
        </div>
      } @else {
        <!-- Tag Usage -->
        @if (tagUsage().length > 0) {
          <mat-card class="analytics-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>bar_chart</mat-icon>
                Tag Usage
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="tag-stats">
                @for (usage of tagUsage().slice(0, 8); track usage.tagId; let idx = $index) {
                  <div class="stat-item">
                    <div class="stat-rank">#{{ idx + 1 }}</div>
                    <div class="stat-content">
                      <div class="stat-name">{{ usage.name }}</div>
                      <div class="stat-details">
                        <span class="transaction-count">{{ usage.transactionCount }} transactions</span>
                      </div>
                      <div class="usage-bar">
                        <div
                          class="usage-fill"
                          [style.width.%]="getUsagePercentage(usage.transactionCount)"
                        ></div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>
        }

        <!-- Tags List -->
        <mat-card class="tags-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>list</mat-icon>
              All Tags
            </mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (tags().length === 0) {
              <div class="empty-state">
                <mat-icon>sell</mat-icon>
                <h3>No Tags Yet</h3>
                <p>Create tags to add additional organization to your transactions</p>
              </div>
            } @else {
              <div class="tags-grid">
                @for (tag of tags(); track tag.id) {
                  <mat-chip-row
                    class="tag-chip"
                    [style.--chip-color]="tag.color || '#6366f1'"
                  >
                    <span class="tag-name">{{ tag.name }}</span>
                    <button
                      matChipRemove
                      (click)="deleteTag(tag)"
                      [disabled]="deleting().has(tag.id)"
                    >
                      @if (deleting().has(tag.id)) {
                        <mat-spinner diameter="16"></mat-spinner>
                      } @else {
                        <mat-icon>cancel</mat-icon>
                      }
                    </button>
                  </mat-chip-row>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
})
export class TagsComponent implements OnInit {
  private readonly apiService = inject(FinanceApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);

  loading = signal(true);
  submitting = signal(false);
  deleting = signal<Set<string>>(new Set());
  tags = signal<Tag[]>([]);
  tagUsage = signal<TagUsage[]>([]);

  tagControl = new FormControl('', [
    Validators.required,
    Validators.minLength(2),
    Validators.maxLength(50),
  ]);

  colorControl = new FormControl('#6366f1');

  private maxUsageCount = 1;

  ngOnInit() {
    this.loadData();
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
      this.maxUsageCount = Math.max(...usage.map(u => u.transactionCount), 1);
    } catch (error) {
      console.error('Error loading tags:', error);
      this.snackBar.open('Failed to load tags', 'Dismiss', { duration: 3000 });
    } finally {
      this.loading.set(false);
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
      this.tags.update(t => t.filter(x => x.id !== tag.id));
      this.snackBar.open('Tag deleted', 'Dismiss', { duration: 2000 });
    } catch (error) {
      console.error('Error deleting tag:', error);
      this.snackBar.open('Failed to delete tag', 'Dismiss', { duration: 3000 });
    } finally {
      const updatedDeleting = new Set(this.deleting());
      updatedDeleting.delete(tag.id);
      this.deleting.set(updatedDeleting);
    }
  }

  getUsagePercentage(count: number): number {
    return (count / this.maxUsageCount) * 100;
  }
}
