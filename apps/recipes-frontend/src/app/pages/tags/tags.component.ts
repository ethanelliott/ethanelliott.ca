import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TextareaModule } from 'primeng/textarea';
import {
  RecipesApiService,
  Tag,
  TagInput,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-tags',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    DialogModule,
    InputTextModule,
    ColorPickerModule,
    ConfirmDialogModule,
    ProgressSpinnerModule,
    TextareaModule,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    <div class="tags-page">
      <div class="page-header">
        <div>
          <h1>Tags</h1>
          <p class="subtitle">Label your recipes with tags</p>
        </div>
        <p-button label="Add Tag" icon="pi pi-plus" (click)="openForm()" />
      </div>

      @if (loading()) {
      <div class="loading-container">
        <p-progress-spinner ariaLabel="Loading" />
      </div>
      } @else if (tags().length === 0) {
      <div class="empty-state">
        <i class="pi pi-tags"></i>
        <p>No tags yet. Create one to get started!</p>
      </div>
      } @else {
      <div class="tags-grid">
        @for (tag of tags(); track tag.id; let i = $index) {
        <div class="tag-card" [style.animation-delay]="i * 50 + 'ms'">
          <div class="card-body">
            <div
              class="tag-chip-preview"
              [style.border-color]="tag.color || 'var(--p-primary-color)'"
              [style.color]="tag.color || 'var(--p-primary-color)'"
            >
              {{ tag.name }}
            </div>
            @if (tag.description) {
            <p class="tag-desc">{{ tag.description }}</p>
            }
            <div class="card-actions">
              <p-button
                icon="pi pi-pencil"
                [text]="true"
                [rounded]="true"
                severity="secondary"
                (click)="openForm(tag)"
              />
              <p-button
                icon="pi pi-trash"
                [text]="true"
                [rounded]="true"
                severity="danger"
                (click)="confirmDelete(tag)"
              />
            </div>
          </div>
        </div>
        }
      </div>
      }

      <!-- Create/Edit Dialog -->
      <p-dialog
        [(visible)]="formVisible"
        [header]="editing() ? 'Edit Tag' : 'New Tag'"
        [modal]="true"
        [style]="{ width: '400px' }"
        [closable]="true"
      >
        <div class="form-fields">
          <div class="form-field">
            <label for="tagName">Name</label>
            <input
              pInputText
              id="tagName"
              [(ngModel)]="formName"
              placeholder="Tag name"
            />
          </div>
          <div class="form-field">
            <label for="tagDesc">Description</label>
            <textarea
              pTextarea
              [autoResize]="true"
              id="tagDesc"
              [(ngModel)]="formDescription"
              rows="3"
              placeholder="Optional description"
            ></textarea>
          </div>
          <div class="form-field">
            <label>Color</label>
            <div class="color-row">
              <p-colorpicker [(ngModel)]="formColor" />
              <div
                class="tag-chip-demo"
                [style.border-color]="formColor || '#f97316'"
                [style.color]="formColor || '#f97316'"
              >
                {{ formName || 'Preview' }}
              </div>
            </div>
          </div>
        </div>
        <ng-template #footer>
          <div class="dialog-footer">
            <p-button
              label="Cancel"
              severity="secondary"
              [outlined]="true"
              (click)="formVisible = false"
            />
            <p-button
              [label]="editing() ? 'Save' : 'Create'"
              icon="pi pi-check"
              (click)="save()"
              [loading]="saving()"
              [disabled]="!formName.trim()"
            />
          </div>
        </ng-template>
      </p-dialog>
    </div>
  `,
  styles: `
    .tags-page {
      max-width: 1000px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;

      h1 {
        margin: 0 0 4px;
        font-size: 1.5rem;
        font-weight: 700;
      }

      .subtitle {
        margin: 0;
        color: var(--p-text-muted-color);
        font-size: 0.9rem;
      }
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 64px 0;
    }

    .empty-state {
      text-align: center;
      padding: 64px 0;
      color: var(--p-text-muted-color);

      i {
        font-size: 3rem;
        margin-bottom: 16px;
      }
    }

    .tags-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }

    .tag-card {
      background: var(--p-surface-800);
      border-radius: 12px;
      overflow: hidden;
      animation: fadeIn 0.3s ease-out both;
      transition: transform 0.2s, box-shadow 0.2s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      }
    }

    .card-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
    }

    .tag-chip-preview {
      display: inline-block;
      padding: 4px 12px;
      border: 2px solid;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      width: fit-content;
    }

    .tag-desc {
      margin: 8px 0 0;
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
      flex: 1;
    }

    .card-actions {
      display: flex;
      gap: 4px;
      margin-top: 12px;
      justify-content: flex-end;
    }

    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--p-text-muted-color);
      }

      input, textarea {
        width: 100%;
      }
    }

    .color-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .tag-chip-demo {
      display: inline-block;
      padding: 4px 12px;
      border: 2px solid;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .dialog-footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
})
export class TagsComponent implements OnInit {
  private api = inject(RecipesApiService);
  private confirmationService = inject(ConfirmationService);

  tags = signal<Tag[]>([]);
  loading = signal(true);
  saving = signal(false);
  editing = signal(false);
  formVisible = false;
  editId = '';

  formName = '';
  formDescription = '';
  formColor = '#f97316';

  ngOnInit() {
    this.loadTags();
  }

  loadTags() {
    this.loading.set(true);
    this.api.getTags().subscribe((tags) => {
      this.tags.set(tags);
      this.loading.set(false);
    });
  }

  openForm(tag?: Tag) {
    if (tag) {
      this.editing.set(true);
      this.editId = tag.id;
      this.formName = tag.name;
      this.formDescription = tag.description || '';
      this.formColor = tag.color || '#f97316';
    } else {
      this.editing.set(false);
      this.editId = '';
      this.formName = '';
      this.formDescription = '';
      this.formColor = '#f97316';
    }
    this.formVisible = true;
  }

  save() {
    if (!this.formName.trim()) return;
    this.saving.set(true);

    const input: TagInput = {
      name: this.formName.trim(),
      description: this.formDescription.trim() || undefined,
      color: this.formColor || undefined,
    };

    const obs = this.editing()
      ? this.api.updateTag(this.editId, input)
      : this.api.createTag(input);

    obs.subscribe(() => {
      this.saving.set(false);
      this.formVisible = false;
      this.loadTags();
    });
  }

  confirmDelete(tag: Tag) {
    this.confirmationService.confirm({
      message: `Delete tag "${tag.name}"?`,
      header: 'Confirm',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteTag(tag.id).subscribe(() => {
          this.loadTags();
        });
      },
    });
  }
}
