import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TextareaModule } from 'primeng/textarea';
import {
  RecipesApiService,
  Recipe,
  Category,
  Tag,
  RecipeInput,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-recipe-form',
  standalone: true,
  imports: [
    RouterModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    MultiSelectModule,
    CardModule,
    ConfirmDialogModule,
    ProgressSpinnerModule,
    TextareaModule,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    <div class="recipe-form-page">
      <!-- Header -->
      <div class="form-header">
        <p-button
          icon="pi pi-arrow-left"
          label="Back"
          [text]="true"
          severity="secondary"
          (click)="router.navigate(['/recipes'])"
        />
        <h1 class="form-title">
          {{ isEdit() ? 'Edit Recipe' : 'New Recipe' }}
        </h1>
      </div>

      @if (formLoading()) {
      <div class="loading-container">
        <p-progress-spinner ariaLabel="Loading" />
      </div>
      } @else {
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <!-- Basic Info -->
        <p-card header="Basic Information" styleClass="form-card">
          <div class="form-grid">
            <div class="form-field full-width">
              <label for="title">Title *</label>
              <input
                pInputText
                id="title"
                formControlName="title"
                placeholder="Recipe title"
              />
            </div>
            <div class="form-field full-width">
              <label for="description">Description</label>
              <textarea
                pTextarea
                [autoResize]="true"
                id="description"
                formControlName="description"
                rows="3"
                placeholder="Brief description"
              ></textarea>
            </div>
            <div class="form-field">
              <label for="servings">Servings *</label>
              <p-inputnumber
                id="servings"
                formControlName="servings"
                [min]="1"
                [showButtons]="true"
                [fluid]="true"
              />
            </div>
            <div class="form-field">
              <label for="prepTime">Prep Time (min)</label>
              <p-inputnumber
                id="prepTime"
                formControlName="prepTimeMinutes"
                [min]="0"
                [showButtons]="true"
                [fluid]="true"
              />
            </div>
            <div class="form-field">
              <label for="cookTime">Cook Time (min)</label>
              <p-inputnumber
                id="cookTime"
                formControlName="cookTimeMinutes"
                [min]="0"
                [showButtons]="true"
                [fluid]="true"
              />
            </div>
            <div class="form-field">
              <label for="source">Source</label>
              <input
                pInputText
                id="source"
                formControlName="source"
                placeholder="URL or reference"
              />
            </div>
            <div class="form-field">
              <label>Categories</label>
              <p-multiselect
                [options]="categories()"
                formControlName="categoryIds"
                optionLabel="name"
                optionValue="id"
                placeholder="Select categories"
                display="chip"
                [fluid]="true"
              />
            </div>
            <div class="form-field">
              <label>Tags</label>
              <p-multiselect
                [options]="tags()"
                formControlName="tagIds"
                optionLabel="name"
                optionValue="id"
                placeholder="Select tags"
                display="chip"
                [fluid]="true"
              />
            </div>
          </div>
        </p-card>

        <!-- Ingredients -->
        <p-card header="Ingredients" styleClass="form-card">
          @if (ingredients.length === 0) {
          <p class="empty-message">No ingredients added yet.</p>
          }
          <div class="ingredients-list" formArrayName="ingredients">
            @for (ing of ingredients.controls; track $index; let i = $index) {
            <div class="ingredient-row" [formGroupName]="i">
              <p-inputnumber
                formControlName="quantity"
                placeholder="Qty"
                [min]="0"
                [fluid]="true"
                class="ing-qty-input"
              />
              <input
                pInputText
                formControlName="unit"
                placeholder="Unit"
                class="ing-unit-input"
              />
              <input
                pInputText
                formControlName="name"
                placeholder="Ingredient name"
                class="ing-name-input"
              />
              <input
                pInputText
                formControlName="notes"
                placeholder="Notes"
                class="ing-notes-input"
              />
              <p-button
                icon="pi pi-trash"
                severity="danger"
                [text]="true"
                [rounded]="true"
                (click)="removeIngredient(i)"
              />
            </div>
            }
          </div>
          <p-button
            label="Add Ingredient"
            icon="pi pi-plus"
            severity="secondary"
            [outlined]="true"
            (click)="addIngredient()"
            styleClass="mt-3"
          />
        </p-card>

        <!-- Instructions -->
        <p-card header="Instructions" styleClass="form-card">
          <textarea
            pTextarea
            [autoResize]="true"
            formControlName="instructions"
            rows="10"
            placeholder="Recipe instructions (Markdown supported)"
            class="full-width-textarea"
          ></textarea>
          <small class="hint">Supports Markdown formatting</small>
        </p-card>

        <!-- Notes -->
        <p-card header="Personal Notes" styleClass="form-card">
          <textarea
            pTextarea
            [autoResize]="true"
            formControlName="notes"
            rows="4"
            placeholder="Personal notes"
            class="full-width-textarea"
          ></textarea>
        </p-card>

        <!-- Photos (edit only) -->
        @if (isEdit() && existingPhotos().length > 0) {
        <p-card header="Photos" styleClass="form-card">
          <div class="photos-grid">
            @for (photo of existingPhotos(); track photo.id) {
            <div class="photo-item">
              <img [src]="api.getPhotoUrl(photo.id)" alt="Recipe photo" />
              <p-button
                icon="pi pi-trash"
                severity="danger"
                [rounded]="true"
                size="small"
                class="photo-delete-btn"
                (click)="deletePhoto(photo.id)"
              />
            </div>
            }
          </div>
        </p-card>
        } @if (isEdit()) {
        <p-card header="Upload Photo" styleClass="form-card">
          <input
            type="file"
            accept="image/*"
            (change)="onFileSelected($event)"
            #fileInput
            style="display: none"
          />
          <p-button
            label="Choose Photo"
            icon="pi pi-upload"
            severity="secondary"
            [outlined]="true"
            (click)="fileInput.click()"
            [loading]="uploadLoading()"
          />
        </p-card>
        }

        <!-- Actions -->
        <div class="form-actions">
          <p-button
            label="Cancel"
            severity="secondary"
            [outlined]="true"
            (click)="router.navigate(['/recipes'])"
          />
          <p-button
            [label]="isEdit() ? 'Save Changes' : 'Create Recipe'"
            icon="pi pi-check"
            type="submit"
            [loading]="saving()"
            [disabled]="form.invalid || saving()"
          />
        </div>
      </form>
      }
    </div>
  `,
  styles: `
    .recipe-form-page {
      max-width: 800px;
      margin: 0 auto;
    }

    .form-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .form-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 64px 0;
    }

    :host ::ng-deep .form-card {
      margin-bottom: 16px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .full-width {
      grid-column: 1 / -1;
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

    .ingredients-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ingredient-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .ing-qty-input {
      width: 80px;
      min-width: 80px;
      max-width: 80px;
      flex-shrink: 0;
    }

    .ing-unit-input {
      width: 80px;
      min-width: 80px;
      max-width: 80px;
      flex-shrink: 0;
    }

    .ing-name-input {
      flex: 1;
      min-width: 0;
    }

    .ing-notes-input {
      width: 120px;
      min-width: 120px;
      max-width: 120px;
      flex-shrink: 0;
    }

    .empty-message {
      color: var(--p-text-muted-color);
      text-align: center;
      padding: 16px;
      margin: 0;
    }

    .full-width-textarea {
      width: 100%;
    }

    .hint {
      color: var(--p-text-muted-color);
      font-size: 0.8rem;
      margin-top: 6px;
    }

    .photos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px;
    }

    .photo-item {
      position: relative;

      img {
        width: 100%;
        height: 100px;
        object-fit: cover;
        border-radius: 8px;
      }
    }

    .photo-delete-btn {
      position: absolute;
      top: 4px;
      right: 4px;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 0;
    }

    @media (max-width: 640px) {
      .form-grid {
        grid-template-columns: 1fr;
      }

      .ingredient-row {
        flex-wrap: wrap;
      }

      .ing-notes-input {
        width: 100%;
      }
    }
  `,
})
export class RecipeFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private confirmationService = inject(ConfirmationService);
  api = inject(RecipesApiService);
  router = inject(Router);

  isEdit = signal(false);
  formLoading = signal(false);
  saving = signal(false);
  uploadLoading = signal(false);
  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);
  existingPhotos = signal<Array<{ id: string }>>([]);
  private recipeId = '';

  form: FormGroup = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    servings: [4, [Validators.required, Validators.min(1)]],
    prepTimeMinutes: [null as number | null],
    cookTimeMinutes: [null as number | null],
    source: [''],
    categoryIds: [[] as string[]],
    tagIds: [[] as string[]],
    ingredients: this.fb.array([]),
    instructions: [''],
    notes: [''],
  });

  get ingredients(): FormArray {
    return this.form.get('ingredients') as FormArray;
  }

  ngOnInit() {
    this.api.getCategories().subscribe((cats) => this.categories.set(cats));
    this.api.getTags().subscribe((tags) => this.tags.set(tags));

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.recipeId = id;
      this.formLoading.set(true);

      this.api.getRecipe(id).subscribe((recipe) => {
        this.form.patchValue({
          title: recipe.title,
          description: recipe.description || '',
          servings: recipe.servings,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          source: recipe.source || '',
          categoryIds: recipe.categories.map((c) => c.id),
          tagIds: recipe.tags.map((t) => t.id),
          instructions: recipe.instructions || '',
          notes: recipe.notes || '',
        });

        this.ingredients.clear();
        recipe.ingredients.forEach((ing) => {
          this.ingredients.push(
            this.fb.group({
              quantity: [ing.quantity],
              unit: [ing.unit],
              name: [ing.name],
              notes: [ing.notes || ''],
            })
          );
        });

        this.existingPhotos.set(
          (recipe.photos || []).map((p) => ({ id: p.id }))
        );
        this.formLoading.set(false);
      });
    }
  }

  addIngredient() {
    this.ingredients.push(
      this.fb.group({
        quantity: [1],
        unit: [''],
        name: [''],
        notes: [''],
      })
    );
  }

  removeIngredient(index: number) {
    this.ingredients.removeAt(index);
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.saving.set(true);

    const val = this.form.value;
    const input: RecipeInput = {
      title: val.title,
      description: val.description || undefined,
      servings: val.servings,
      prepTimeMinutes: val.prepTimeMinutes || undefined,
      cookTimeMinutes: val.cookTimeMinutes || undefined,
      source: val.source || undefined,
      categoryIds: val.categoryIds,
      tagIds: val.tagIds,
      ingredients: (val.ingredients || []).map(
        (
          i: { quantity: number; unit: string; name: string; notes: string },
          idx: number
        ) => ({
          quantity: i.quantity,
          unit: i.unit,
          name: i.name,
          notes: i.notes || undefined,
          orderIndex: idx,
        })
      ),
      instructions: val.instructions || undefined,
      notes: val.notes || undefined,
    };

    const obs = this.isEdit()
      ? this.api.updateRecipe(this.recipeId, input)
      : this.api.createRecipe(input);

    obs.subscribe((recipe) => {
      this.saving.set(false);
      this.router.navigate(['/recipes', recipe.id]);
    });
  }

  deletePhoto(photoId: string) {
    this.confirmationService.confirm({
      message: 'Delete this photo?',
      header: 'Confirm',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deletePhoto(photoId).subscribe(() => {
          this.existingPhotos.set(
            this.existingPhotos().filter((p) => p.id !== photoId)
          );
        });
      },
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadLoading.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      this.api
        .uploadPhoto(this.recipeId, {
          filename: file.name,
          mimeType: file.type,
          data: base64,
        })
        .subscribe((photo) => {
          this.existingPhotos.set([...this.existingPhotos(), { id: photo.id }]);
          this.uploadLoading.set(false);
        });
    };
    reader.readAsDataURL(file);
  }
}
