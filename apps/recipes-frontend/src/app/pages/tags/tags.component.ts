import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  RecipesApiService,
  Tag,
  TagInput,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-tags',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Tags</h1>
        <button mat-fab extended color="primary" (click)="openForm()">
          <mat-icon>add</mat-icon>
          Add Tag
        </button>
      </div>

      @if (loading()) {
      <div class="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
      } @else if (tags().length === 0) {
      <div class="empty-state">
        <mat-icon>label</mat-icon>
        <h2>No tags yet</h2>
        <p>Create tags to add extra labels to your recipes.</p>
      </div>
      } @else {
      <div class="tags-list">
        @for (tag of tags(); track tag.id) {
        <mat-card class="tag-card">
          <mat-card-content>
            <div
              class="tag-preview"
              [style.border-color]="tag.color || '#666'"
              [style.color]="tag.color || '#666'"
            >
              {{ tag.name }}
            </div>
            @if (tag.description) {
            <p class="description">{{ tag.description }}</p>
            }
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button (click)="openForm(tag)">
              <mat-icon>edit</mat-icon>
              Edit
            </button>
            <button mat-button color="warn" (click)="deleteTag(tag)">
              <mat-icon>delete</mat-icon>
              Delete
            </button>
          </mat-card-actions>
        </mat-card>
        }
      </div>
      }

      <!-- Inline Form -->
      @if (showForm()) {
      <div class="form-overlay" (click)="closeForm()">
        <mat-card class="form-card" (click)="$event.stopPropagation()">
          <mat-card-header>
            <mat-card-title>{{
              editingTag() ? 'Edit Tag' : 'New Tag'
            }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Name</mat-label>
              <input
                matInput
                [(ngModel)]="formData.name"
                placeholder="Tag name"
              />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description</mat-label>
              <textarea
                matInput
                [(ngModel)]="formData.description"
                rows="2"
                placeholder="Optional description"
              ></textarea>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Color</mat-label>
              <input matInput type="color" [(ngModel)]="formData.color" />
            </mat-form-field>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button (click)="closeForm()">Cancel</button>
            <button
              mat-raised-button
              color="primary"
              (click)="saveTag()"
              [disabled]="!formData.name"
            >
              {{ editingTag() ? 'Save' : 'Create' }}
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
      }
    </div>
  `,
  styles: `
    .page-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-lg);
    }

    h1 {
      margin: 0;
      font-size: 2rem;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-2xl);
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-3xl);
      color: var(--mat-sys-on-surface-variant);
    }

    .empty-state mat-icon {
      font-size: 4rem;
      width: 4rem;
      height: 4rem;
      margin-bottom: var(--spacing-md);
    }

    .tags-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--spacing-lg);
    }

    .tag-card mat-card-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .tag-preview {
      display: inline-block;
      padding: 4px 12px;
      border: 2px solid;
      border-radius: 16px;
      font-weight: 500;
      width: fit-content;
    }

    .description {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .form-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .form-card {
      width: 100%;
      max-width: 400px;
    }

    .full-width {
      width: 100%;
    }
  `,
})
export class TagsComponent implements OnInit {
  private readonly api = inject(RecipesApiService);

  loading = signal(true);
  tags = signal<Tag[]>([]);
  showForm = signal(false);
  editingTag = signal<Tag | null>(null);

  formData = {
    name: '',
    description: '',
    color: '#666666',
  };

  ngOnInit() {
    this.loadTags();
  }

  loadTags() {
    this.loading.set(true);
    this.api.getTags().subscribe({
      next: (tags) => {
        this.tags.set(tags);
        this.loading.set(false);
      },
    });
  }

  openForm(tag?: Tag) {
    if (tag) {
      this.editingTag.set(tag);
      this.formData = {
        name: tag.name,
        description: tag.description || '',
        color: tag.color || '#666666',
      };
    } else {
      this.editingTag.set(null);
      this.formData = {
        name: '',
        description: '',
        color: '#666666',
      };
    }
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editingTag.set(null);
  }

  saveTag() {
    const input: TagInput = {
      name: this.formData.name,
      description: this.formData.description || undefined,
      color: this.formData.color,
    };

    const editing = this.editingTag();
    const request = editing
      ? this.api.updateTag(editing.id, input)
      : this.api.createTag(input);

    request.subscribe({
      next: () => {
        this.closeForm();
        this.loadTags();
      },
    });
  }

  deleteTag(tag: Tag) {
    if (confirm(`Delete tag "${tag.name}"?`)) {
      this.api.deleteTag(tag.id).subscribe({
        next: () => this.loadTags(),
      });
    }
  }
}
