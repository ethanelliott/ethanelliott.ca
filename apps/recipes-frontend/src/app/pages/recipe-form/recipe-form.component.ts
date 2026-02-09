import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormBuilder,
  FormArray,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import {
  RecipesApiService,
  Recipe,
  Category,
  Tag,
  IngredientInput,
} from '../../services/recipes-api.service';

@Component({
  selector: 'app-recipe-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-container">
      <div class="header">
        <div class="header-content">
          <button mat-icon-button routerLink="/recipes" class="back-btn">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1>{{ isEditing() ? 'Edit Recipe' : 'New Recipe' }}</h1>
        </div>
      </div>

      @if (loading()) {
      <div class="loading">
        <mat-spinner diameter="48"></mat-spinner>
      </div>
      } @else {
      <form [formGroup]="form" (ngSubmit)="save()">
        <mat-card>
          <mat-card-header>
            <mat-card-title>Basic Information</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Title</mat-label>
              <input
                matInput
                formControlName="title"
                placeholder="Recipe title"
              />
              @if (form.get('title')?.hasError('required')) {
              <mat-error>Title is required</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description</mat-label>
              <textarea
                matInput
                formControlName="description"
                rows="2"
                placeholder="Brief description of the dish"
              ></textarea>
            </mat-form-field>

            <div class="row">
              <mat-form-field appearance="outline">
                <mat-label>Servings</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="servings"
                  min="1"
                />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Prep Time (min)</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="prepTimeMinutes"
                  min="0"
                />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Cook Time (min)</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="cookTimeMinutes"
                  min="0"
                />
              </mat-form-field>
            </div>

            <div class="row">
              <mat-form-field appearance="outline" class="flex-1">
                <mat-label>Categories</mat-label>
                <mat-select formControlName="categoryIds" multiple>
                  @for (category of categories(); track category.id) {
                  <mat-option [value]="category.id">{{
                    category.name
                  }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="flex-1">
                <mat-label>Tags</mat-label>
                <mat-select formControlName="tagIds" multiple>
                  @for (tag of tags(); track tag.id) {
                  <mat-option [value]="tag.id">{{ tag.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Source</mat-label>
              <input
                matInput
                formControlName="source"
                placeholder="Where did this recipe come from?"
              />
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Ingredients</mat-card-title>
            <button mat-button type="button" (click)="addIngredient()">
              <mat-icon>add</mat-icon>
              Add Ingredient
            </button>
          </mat-card-header>
          <mat-card-content formArrayName="ingredients">
            @for (ingredient of ingredientsArray.controls; track $index; let i =
            $index) {
            <div class="ingredient-row" [formGroupName]="i">
              <mat-form-field appearance="outline" class="quantity-field">
                <mat-label>Qty</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="quantity"
                  step="0.25"
                  min="0"
                />
              </mat-form-field>

              <mat-form-field appearance="outline" class="unit-field">
                <mat-label>Unit</mat-label>
                <input
                  matInput
                  formControlName="unit"
                  placeholder="cups, tsp, etc."
                />
              </mat-form-field>

              <mat-form-field appearance="outline" class="name-field">
                <mat-label>Ingredient</mat-label>
                <input
                  matInput
                  formControlName="name"
                  placeholder="Ingredient name"
                />
              </mat-form-field>

              <mat-form-field appearance="outline" class="notes-field">
                <mat-label>Notes</mat-label>
                <input
                  matInput
                  formControlName="notes"
                  placeholder="Optional notes"
                />
              </mat-form-field>

              <button
                mat-icon-button
                type="button"
                (click)="removeIngredient(i)"
                color="warn"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
            } @if (ingredientsArray.length === 0) {
            <p class="empty-message">
              No ingredients added yet. Click "Add Ingredient" to start.
            </p>
            }
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Instructions</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Instructions</mat-label>
              <textarea
                matInput
                formControlName="instructions"
                rows="10"
                placeholder="Step-by-step instructions..."
              ></textarea>
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Notes</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Personal Notes</mat-label>
              <textarea
                matInput
                formControlName="notes"
                rows="4"
                placeholder="Tips, modifications, or personal notes..."
              ></textarea>
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <!-- Photo Upload -->
        @if (isEditing()) {
        <mat-card>
          <mat-card-header>
            <mat-card-title>Photos</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (existingPhotos().length > 0) {
            <div class="photos-grid">
              @for (photo of existingPhotos(); track photo.id) {
              <div class="photo-item">
                <img [src]="getPhotoUrl(photo.id)" [alt]="photo.filename" />
                <button
                  mat-icon-button
                  class="delete-photo"
                  (click)="deletePhoto(photo.id)"
                  type="button"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
              }
            </div>
            }
            <div class="upload-area">
              <input
                type="file"
                #fileInput
                accept="image/*"
                (change)="onFileSelected($event)"
                hidden
              />
              <button
                mat-stroked-button
                type="button"
                (click)="fileInput.click()"
              >
                <mat-icon>add_photo_alternate</mat-icon>
                Add Photo
              </button>
            </div>
          </mat-card-content>
        </mat-card>
        }

        <div class="actions">
          <button mat-button type="button" routerLink="/recipes">Cancel</button>
          <button
            mat-raised-button
            color="primary"
            type="submit"
            [disabled]="saving() || !form.valid"
          >
            @if (saving()) {
            <mat-spinner diameter="20"></mat-spinner>
            } @else {
            {{ isEditing() ? 'Save Changes' : 'Create Recipe' }}
            }
          </button>
        </div>
      </form>
      }
    </div>
  `,
  styles: `
    .form-container {
      max-width: 900px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-xl);
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .back-btn {
      background: rgba(255, 255, 255, 0.05);
    }

    h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: var(--spacing-3xl);
    }

    form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }

    mat-card {
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--border-radius-lg);
    }

    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: var(--spacing-md);
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: var(--spacing-md);
    }

    mat-card-title {
      font-size: 1rem;
      font-weight: 600;
    }

    mat-card-content {
      padding-top: var(--spacing-md);
    }

    .full-width {
      width: 100%;
    }

    .row {
      display: flex;
      gap: var(--spacing-md);
    }

    .flex-1 {
      flex: 1;
    }

    .ingredient-row {
      display: flex;
      gap: var(--spacing-sm);
      align-items: flex-start;
      margin-bottom: var(--spacing-sm);
      padding: var(--spacing-sm);
      background: rgba(255, 255, 255, 0.02);
      border-radius: var(--border-radius-sm);
    }

    .quantity-field {
      width: 80px;
    }

    .unit-field {
      width: 100px;
    }

    .name-field {
      flex: 1;
    }

    .notes-field {
      flex: 1;
    }

    .empty-message {
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
      padding: var(--spacing-lg);
    }

    .photos-grid {
      display: flex;
      gap: var(--spacing-md);
      flex-wrap: wrap;
      margin-bottom: var(--spacing-md);
    }

    .photo-item {
      position: relative;
    }

    .photo-item img {
      max-height: 150px;
      border-radius: var(--border-radius-md);
      border: 1px solid var(--border-subtle);
    }

    .delete-photo {
      position: absolute;
      top: 4px;
      right: 4px;
      background: rgba(0, 0, 0, 0.7) !important;
    }

    .upload-area {
      padding: var(--spacing-lg);
      text-align: center;
      border: 2px dashed var(--border-default);
      border-radius: var(--border-radius-md);
      background: rgba(255, 255, 255, 0.02);
      transition: all 0.2s ease;
    }

    .upload-area:hover {
      border-color: var(--border-emphasis);
      background: rgba(255, 255, 255, 0.04);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-md);
      padding: var(--spacing-lg) 0;
      border-top: 1px solid var(--border-subtle);
    }

    @media (max-width: 640px) {
      .form-container {
        padding: 0;
      }

      .header {
        margin-bottom: var(--spacing-md);
      }

      .header-content h1 {
        font-size: 1.5rem;
      }

      mat-card {
        border-radius: 0;
        border-left: none;
        border-right: none;
      }

      mat-card-content {
        padding: var(--spacing-md) !important;
      }

      .row {
        flex-direction: column;
      }

      .ingredient-row {
        flex-wrap: wrap;
        gap: var(--spacing-sm);
      }

      .quantity-field {
        width: 70px;
        flex: 0 0 auto;
      }

      .unit-field {
        width: 80px;
        flex: 0 0 auto;
      }

      .name-field {
        flex: 1 1 100%;
        width: 100%;
        margin-top: var(--spacing-xs);
      }

      .ingredient-row button {
        margin-top: var(--spacing-xs);
      }

      .actions {
        flex-direction: column;
        padding: var(--spacing-md) 0;
      }

      .actions button {
        width: 100%;
      }

      .upload-area {
        padding: var(--spacing-md);
      }
    }
  `,
})
export class RecipeFormComponent implements OnInit {
  private readonly api = inject(RecipesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  isEditing = signal(false);
  categories = signal<Category[]>([]);
  tags = signal<Tag[]>([]);
  existingPhotos = signal<{ id: string; filename: string }[]>([]);
  private recipeId: string | null = null;

  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    instructions: [''],
    servings: [4, [Validators.required, Validators.min(1)]],
    prepTimeMinutes: [null as number | null],
    cookTimeMinutes: [null as number | null],
    notes: [''],
    source: [''],
    categoryIds: [[] as string[]],
    tagIds: [[] as string[]],
    ingredients: this.fb.array<any>([]),
  });

  get ingredientsArray(): FormArray {
    return this.form.get('ingredients') as FormArray;
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditing.set(true);
      this.recipeId = id;
      this.loadRecipe(id);
    } else {
      this.loadMetadata();
    }
  }

  loadMetadata() {
    Promise.all([
      this.api.getCategories().toPromise(),
      this.api.getTags().toPromise(),
    ]).then(([categories, tags]) => {
      this.categories.set(categories || []);
      this.tags.set(tags || []);
      this.loading.set(false);
    });
  }

  loadRecipe(id: string) {
    Promise.all([
      this.api.getRecipe(id).toPromise(),
      this.api.getCategories().toPromise(),
      this.api.getTags().toPromise(),
    ]).then(([recipe, categories, tags]) => {
      this.categories.set(categories || []);
      this.tags.set(tags || []);

      if (recipe) {
        this.form.patchValue({
          title: recipe.title,
          description: recipe.description || '',
          instructions: recipe.instructions || '',
          servings: recipe.servings,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          notes: recipe.notes || '',
          source: recipe.source || '',
          categoryIds: recipe.categories.map((c) => c.id),
          tagIds: recipe.tags.map((t) => t.id),
        });

        // Clear and add ingredients
        this.ingredientsArray.clear();
        for (const ing of recipe.ingredients) {
          this.addIngredient({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            notes: ing.notes ?? undefined,
            orderIndex: ing.orderIndex,
          });
        }

        if (recipe.photos) {
          this.existingPhotos.set(
            recipe.photos.map((p) => ({ id: p.id, filename: p.filename }))
          );
        }
      }

      this.loading.set(false);
    });
  }

  addIngredient(data?: IngredientInput) {
    const group = this.fb.group({
      name: [data?.name || '', Validators.required],
      quantity: [data?.quantity || 1, [Validators.required, Validators.min(0)]],
      unit: [data?.unit || ''],
      notes: [data?.notes || ''],
    });
    this.ingredientsArray.push(group);
  }

  removeIngredient(index: number) {
    this.ingredientsArray.removeAt(index);
  }

  save() {
    if (!this.form.valid) return;

    this.saving.set(true);
    const value = this.form.value;

    const input = {
      title: value.title!,
      description: value.description || undefined,
      instructions: value.instructions || undefined,
      servings: value.servings!,
      prepTimeMinutes: value.prepTimeMinutes || undefined,
      cookTimeMinutes: value.cookTimeMinutes || undefined,
      notes: value.notes || undefined,
      source: value.source || undefined,
      categoryIds: value.categoryIds || [],
      tagIds: value.tagIds || [],
      ingredients: (value.ingredients || []).map((ing: any, index: number) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit || '',
        notes: ing.notes || undefined,
        orderIndex: index,
      })),
    };

    const request = this.isEditing()
      ? this.api.updateRecipe(this.recipeId!, input)
      : this.api.createRecipe(input);

    request.subscribe({
      next: (recipe) => {
        this.router.navigate(['/recipes', recipe.id]);
      },
      error: () => {
        this.saving.set(false);
      },
    });
  }

  getPhotoUrl(photoId: string): string {
    return this.api.getPhotoUrl(photoId);
  }

  deletePhoto(photoId: string) {
    if (confirm('Delete this photo?')) {
      this.api.deletePhoto(photoId).subscribe({
        next: () => {
          this.existingPhotos.update((photos) =>
            photos.filter((p) => p.id !== photoId)
          );
        },
      });
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.recipeId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      this.api
        .uploadPhoto(this.recipeId!, {
          filename: file.name,
          mimeType: file.type,
          data: base64,
        })
        .subscribe({
          next: (photo) => {
            this.existingPhotos.update((photos) => [
              ...photos,
              { id: photo.id, filename: photo.filename },
            ]);
          },
        });
    };
    reader.readAsDataURL(file);
  }
}
