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
        <div class="header-text">
          <h1>Tags</h1>
          <p class="subtitle">Add extra labels to your recipes</p>
        </div>
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
        <div class="empty-icon">
          <mat-icon>label</mat-icon>
        </div>
        <h2>No tags yet</h2>
        <p>Create tags to add extra labels to your recipes.</p>
      </div>
      } @else {
      <div class="tags-grid">
        @for (tag of tags(); track tag.id; let i = $index) {
        <div class="tag-card" [style.--delay]="i">
          <div class="tag-content">
            <div
              class="tag-preview"
              [style.border-color]="tag.color || '#666'"
              [style.color]="tag.color || '#666'"
            >
              <mat-icon>label</mat-icon>
              {{ tag.name }}
            </div>
            @if (tag.description) {
            <p class="tag-description">{{ tag.description }}</p>
            }
          </div>
          <div class="tag-actions">
            <button mat-icon-button (click)="openForm(tag)">
              <mat-icon>edit</mat-icon>
            </button>
            <button mat-icon-button color="warn" (click)="deleteTag(tag)">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </div>
        }
      </div>
      }

      <!-- Form Modal -->
      @if (showForm()) {
      <div class="form-overlay" (click)="closeForm()">
        <div class="form-card" (click)="$event.stopPropagation()">
          <div class="form-header">
            <h2>{{ editingTag() ? 'Edit Tag' : 'New Tag' }}</h2>
            <button mat-icon-button (click)="closeForm()">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="form-body">
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

            <div class="color-picker">
              <label>Color</label>
              <div class="color-preview" [style.border-color]="formData.color" [style.color]="formData.color">
                <mat-icon>label</mat-icon>
              </div>
              <input type="color" [(ngModel)]="formData.color" />
            </div>
          </div>
          <div class="form-actions">
            <button mat-button (click)="closeForm()">Cancel</button>
            <button
              mat-raised-button
              color="primary"
              (click)="saveTag()"
              [disabled]="!formData.name"
            >
              {{ editingTag() ? 'Save' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
      }
    </div>
  `,
  styles: `
    .page-container {
      max-width: 1000px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--spacing-xl);
    }

    .header-text h1 {
      margin: 0;
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .subtitle {
      margin: var(--spacing-xs) 0 0;
      color: rgba(255, 255, 255, 0.5);
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-3xl);
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-3xl);
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto var(--spacing-lg);
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-icon mat-icon {
      font-size: 2.5rem;
      width: 2.5rem;
      height: 2.5rem;
      color: rgba(255, 255, 255, 0.3);
    }

    .empty-state h2 {
      margin: 0 0 var(--spacing-sm);
      font-weight: 600;
    }

    .empty-state p {
      color: rgba(255, 255, 255, 0.5);
      margin: 0;
    }

    .tags-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--spacing-md);
    }

    .tag-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md) var(--spacing-lg);
      animation: fadeIn 0.4s ease-out backwards;
      animation-delay: calc(var(--delay, 0) * 40ms);
      transition: all 0.2s ease;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }

    .tag-card:hover {
      border-color: var(--border-default);
    }

    .tag-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .tag-preview {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: 6px 14px;
      border: 2px solid;
      border-radius: var(--border-radius-full);
      font-weight: 500;
      font-size: 0.875rem;
    }

    .tag-preview mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }

    .tag-description {
      margin: 0;
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.8rem;
    }

    .tag-actions {
      display: flex;
      gap: var(--spacing-xs);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .tag-card:hover .tag-actions {
      opacity: 1;
    }

    .form-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    }

    .form-card {
      width: 100%;
      max-width: 400px;
      background: linear-gradient(145deg, #141414, #0a0a0a);
      border: 1px solid var(--border-emphasis);
      border-radius: var(--border-radius-xl);
      overflow: hidden;
    }

    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-lg);
      border-bottom: 1px solid var(--border-subtle);
    }

    .form-header h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .form-body {
      padding: var(--spacing-lg);
    }

    .full-width {
      width: 100%;
    }

    .color-picker {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .color-picker label {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.875rem;
    }

    .color-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: 2px solid;
      border-radius: var(--border-radius-sm);
    }

    .color-preview mat-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
    }

    .color-picker input[type="color"] {
      width: 40px;
      height: 32px;
      border: none;
      background: none;
      cursor: pointer;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) var(--spacing-lg);
      border-top: 1px solid var(--border-subtle);
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
