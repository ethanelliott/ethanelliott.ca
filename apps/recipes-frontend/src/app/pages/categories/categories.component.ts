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
import {
  RecipesApiService,
  Category,
  CategoryInput,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-categories',
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
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    <div class="categories-page">
      <div class="page-header">
        <div>
          <h1>Categories</h1>
          <p class="subtitle">Organize your recipes into categories</p>
        </div>
        <p-button label="Add Category" icon="pi pi-plus" (click)="openForm()" />
      </div>

      @if (loading()) {
      <div class="loading-container">
        <p-progress-spinner ariaLabel="Loading" />
      </div>
      } @else if (categories().length === 0) {
      <div class="empty-state">
        <i class="pi pi-th-large"></i>
        <p>No categories yet. Create one to get started!</p>
      </div>
      } @else {
      <div class="categories-grid">
        @for (cat of categories(); track cat.id; let i = $index) {
        <div class="category-card" [style.animation-delay]="i * 50 + 'ms'">
          <div
            class="color-bar"
            [style.background]="cat.color || 'var(--p-primary-color)'"
          ></div>
          <div class="card-body">
            <h3 class="cat-name">{{ cat.name }}</h3>
            @if (cat.description) {
            <p class="cat-desc">{{ cat.description }}</p>
            }
            <div class="card-actions">
              <p-button
                icon="pi pi-pencil"
                [text]="true"
                [rounded]="true"
                severity="secondary"
                (click)="openForm(cat)"
              />
              <p-button
                icon="pi pi-trash"
                [text]="true"
                [rounded]="true"
                severity="danger"
                (click)="confirmDelete(cat)"
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
        [header]="editing() ? 'Edit Category' : 'New Category'"
        [modal]="true"
        [style]="{ width: '400px' }"
        [closable]="true"
      >
        <div class="form-fields">
          <div class="form-field">
            <label for="catName">Name</label>
            <input
              pInputText
              id="catName"
              [(ngModel)]="formName"
              placeholder="Category name"
            />
          </div>
          <div class="form-field">
            <label for="catDesc">Description</label>
            <textarea
              pTextarea
              id="catDesc"
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
                class="color-preview"
                [style.background]="formColor || '#f97316'"
              ></div>
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
    .categories-page {
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

    .categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }

    .category-card {
      display: flex;
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

    .color-bar {
      width: 6px;
      flex-shrink: 0;
    }

    .card-body {
      flex: 1;
      padding: 16px;
      display: flex;
      flex-direction: column;
    }

    .cat-name {
      margin: 0 0 4px;
      font-size: 1.05rem;
      font-weight: 600;
    }

    .cat-desc {
      margin: 0;
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

    .color-preview {
      width: 32px;
      height: 32px;
      border-radius: 8px;
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
export class CategoriesComponent implements OnInit {
  private api = inject(RecipesApiService);
  private confirmationService = inject(ConfirmationService);

  categories = signal<Category[]>([]);
  loading = signal(true);
  saving = signal(false);
  editing = signal(false);
  formVisible = false;
  editId = '';

  formName = '';
  formDescription = '';
  formColor = '#f97316';

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.loading.set(true);
    this.api.getCategories().subscribe((cats) => {
      this.categories.set(cats);
      this.loading.set(false);
    });
  }

  openForm(cat?: Category) {
    if (cat) {
      this.editing.set(true);
      this.editId = cat.id;
      this.formName = cat.name;
      this.formDescription = cat.description || '';
      this.formColor = cat.color || '#f97316';
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

    const input: CategoryInput = {
      name: this.formName.trim(),
      description: this.formDescription.trim() || undefined,
      color: this.formColor || undefined,
    };

    const obs = this.editing()
      ? this.api.updateCategory(this.editId, input)
      : this.api.createCategory(input);

    obs.subscribe(() => {
      this.saving.set(false);
      this.formVisible = false;
      this.loadCategories();
    });
  }

  confirmDelete(cat: Category) {
    this.confirmationService.confirm({
      message: `Delete category "${cat.name}"?`,
      header: 'Confirm',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteCategory(cat.id).subscribe(() => {
          this.loadCategories();
        });
      },
    });
  }
}
