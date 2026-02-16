import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { In } from 'typeorm';
import { Database } from '../data-source';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import {
  Recipe,
  RecipeIn,
  RecipeOut,
  RecipeSummary,
  IngredientIn,
} from './recipe.entity';
import { Ingredient, IngredientOut } from './ingredient.entity';
import { RecipePhoto, RecipePhotoOut } from './recipe-photo.entity';
import { CategoryOut } from '../categories/category.entity';
import { TagOut } from '../tags/tag.entity';

export interface RecipeFilters {
  search?: string;
  categoryIds?: string[];
  tagIds?: string[];
}

export class RecipesService {
  private readonly _recipeRepository = inject(Database).repositoryFor(Recipe);
  private readonly _ingredientRepository =
    inject(Database).repositoryFor(Ingredient);
  private readonly _photoRepository =
    inject(Database).repositoryFor(RecipePhoto);
  private readonly _categoriesService = inject(CategoriesService);
  private readonly _tagsService = inject(TagsService);

  /**
   * Get all recipes (summary view)
   */
  async getAll(filters?: RecipeFilters): Promise<RecipeSummary[]> {
    let query = this._recipeRepository
      .createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.categories', 'category')
      .leftJoinAndSelect('recipe.tags', 'tag')
      .loadRelationCountAndMap('recipe.photoCount', 'recipe.photos');

    // Apply search filter
    if (filters?.search) {
      query = query.andWhere(
        '(recipe.title LIKE :search OR recipe.description LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    // Apply category filter
    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      query = query.andWhere('category.id IN (:...categoryIds)', {
        categoryIds: filters.categoryIds,
      });
    }

    // Apply tag filter
    if (filters?.tagIds && filters.tagIds.length > 0) {
      query = query.andWhere('tag.id IN (:...tagIds)', {
        tagIds: filters.tagIds,
      });
    }

    query = query.orderBy('recipe.title', 'ASC');

    const recipes = await query.getMany();

    return recipes.map((r) => this.mapToSummary(r));
  }

  /**
   * Get a random recipe with optional filters
   */
  async getRandom(filters?: RecipeFilters): Promise<RecipeOut | null> {
    let query = this._recipeRepository
      .createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.categories', 'category')
      .leftJoinAndSelect('recipe.tags', 'tag')
      .leftJoinAndSelect('recipe.ingredients', 'ingredient')
      .leftJoinAndSelect('recipe.photos', 'photo');

    // Apply category filter
    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      query = query.andWhere('category.id IN (:...categoryIds)', {
        categoryIds: filters.categoryIds,
      });
    }

    // Apply tag filter
    if (filters?.tagIds && filters.tagIds.length > 0) {
      query = query.andWhere('tag.id IN (:...tagIds)', {
        tagIds: filters.tagIds,
      });
    }

    // Get count and pick random
    const count = await query.getCount();
    if (count === 0) return null;

    const randomOffset = Math.floor(Math.random() * count);
    const recipe = await query.skip(randomOffset).take(1).getOne();

    if (!recipe) return null;

    return this.mapToOut(recipe);
  }

  /**
   * Get recipe by ID
   */
  async getById(recipeId: string): Promise<RecipeOut> {
    const recipe = await this._recipeRepository.findOne({
      where: { id: recipeId },
      relations: ['ingredients', 'categories', 'tags', 'photos'],
    });

    if (!recipe) {
      throw new HttpErrors.NotFound('Recipe not found');
    }

    // Sort ingredients by orderIndex
    recipe.ingredients.sort((a, b) => a.orderIndex - b.orderIndex);

    return this.mapToOut(recipe);
  }

  /**
   * Create a new recipe
   */
  async create(input: RecipeIn): Promise<RecipeOut> {
    // Get categories and tags
    const categories = input.categoryIds
      ? await this._categoriesService.getByIds(input.categoryIds)
      : [];
    const tags = input.tagIds
      ? await this._tagsService.getByIds(input.tagIds)
      : [];

    // Create recipe
    const recipe = this._recipeRepository.create({
      title: input.title,
      description: input.description,
      instructions: input.instructions,
      servings: input.servings,
      prepTimeMinutes: input.prepTimeMinutes,
      cookTimeMinutes: input.cookTimeMinutes,
      notes: input.notes,
      source: input.source,
      categories,
      tags,
    });

    // Save recipe first to get ID
    const savedRecipe = await this._recipeRepository.save(recipe);

    // Create ingredients
    if (input.ingredients && input.ingredients.length > 0) {
      const ingredients = input.ingredients.map((ing, index) =>
        this._ingredientRepository.create({
          ...ing,
          orderIndex: ing.orderIndex ?? index,
          recipe: savedRecipe,
        })
      );
      await this._ingredientRepository.save(ingredients);
    }

    // Fetch complete recipe
    return this.getById(savedRecipe.id);
  }

  /**
   * Update a recipe
   */
  async update(recipeId: string, input: Partial<RecipeIn>): Promise<RecipeOut> {
    const recipe = await this._recipeRepository.findOne({
      where: { id: recipeId },
      relations: ['ingredients', 'categories', 'tags'],
    });

    if (!recipe) {
      throw new HttpErrors.NotFound('Recipe not found');
    }

    // Update basic fields
    if (input.title !== undefined) recipe.title = input.title;
    if (input.description !== undefined) recipe.description = input.description;
    if (input.instructions !== undefined)
      recipe.instructions = input.instructions;
    if (input.servings !== undefined) recipe.servings = input.servings;
    if (input.prepTimeMinutes !== undefined)
      recipe.prepTimeMinutes = input.prepTimeMinutes;
    if (input.cookTimeMinutes !== undefined)
      recipe.cookTimeMinutes = input.cookTimeMinutes;
    if (input.notes !== undefined) recipe.notes = input.notes;
    if (input.source !== undefined) recipe.source = input.source;

    // Update categories
    if (input.categoryIds !== undefined) {
      recipe.categories = input.categoryIds.length
        ? await this._categoriesService.getByIds(input.categoryIds)
        : [];
    }

    // Update tags
    if (input.tagIds !== undefined) {
      recipe.tags = input.tagIds.length
        ? await this._tagsService.getByIds(input.tagIds)
        : [];
    }

    // Update ingredients (replace all)
    if (input.ingredients !== undefined) {
      // Delete existing ingredients
      await this._ingredientRepository.delete({ recipe: { id: recipeId } });

      // Assign new ingredients to entity so cascade save doesn't re-insert stale ones
      recipe.ingredients = input.ingredients.map((ing, index) =>
        this._ingredientRepository.create({
          ...ing,
          orderIndex: ing.orderIndex ?? index,
          recipe: recipe,
        })
      );
    }

    await this._recipeRepository.save(recipe);

    return this.getById(recipeId);
  }

  /**
   * Delete a recipe
   */
  async delete(recipeId: string): Promise<void> {
    const recipe = await this._recipeRepository.findOne({
      where: { id: recipeId },
    });

    if (!recipe) {
      throw new HttpErrors.NotFound('Recipe not found');
    }

    await this._recipeRepository.remove(recipe);
  }

  /**
   * Add a photo to a recipe
   */
  async addPhoto(
    recipeId: string,
    filename: string,
    mimeType: string,
    data: Buffer
  ): Promise<RecipePhotoOut> {
    const recipe = await this._recipeRepository.findOne({
      where: { id: recipeId },
      relations: ['photos'],
    });

    if (!recipe) {
      throw new HttpErrors.NotFound('Recipe not found');
    }

    const maxOrder = recipe.photos.reduce(
      (max, p) => Math.max(max, p.orderIndex),
      -1
    );

    const photo = this._photoRepository.create({
      filename,
      mimeType,
      data,
      orderIndex: maxOrder + 1,
      recipe,
    });

    const saved = await this._photoRepository.save(photo);

    return {
      id: saved.id,
      filename: saved.filename,
      mimeType: saved.mimeType,
      orderIndex: saved.orderIndex,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * Get photo data by ID
   */
  async getPhotoData(
    photoId: string
  ): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    const photo = await this._photoRepository.findOne({
      where: { id: photoId },
    });

    if (!photo) {
      throw new HttpErrors.NotFound('Photo not found');
    }

    return {
      data: photo.data,
      mimeType: photo.mimeType,
      filename: photo.filename,
    };
  }

  /**
   * Delete a photo
   */
  async deletePhoto(photoId: string): Promise<void> {
    const photo = await this._photoRepository.findOne({
      where: { id: photoId },
    });

    if (!photo) {
      throw new HttpErrors.NotFound('Photo not found');
    }

    await this._photoRepository.remove(photo);
  }

  /**
   * Get scaled ingredients for a recipe
   */
  async getScaledIngredients(
    recipeId: string,
    targetServings: number
  ): Promise<IngredientOut[]> {
    const recipe = await this._recipeRepository.findOne({
      where: { id: recipeId },
      relations: ['ingredients'],
    });

    if (!recipe) {
      throw new HttpErrors.NotFound('Recipe not found');
    }

    const scaleFactor = targetServings / recipe.servings;

    return recipe.ingredients
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((ing) => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity * scaleFactor,
        unit: ing.unit,
        notes: ing.notes ?? null,
        orderIndex: ing.orderIndex,
        createdAt: ing.createdAt,
        updatedAt: ing.updatedAt,
      }));
  }

  private mapToOut(recipe: Recipe): RecipeOut {
    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description ?? null,
      instructions: recipe.instructions ?? null,
      servings: recipe.servings,
      prepTimeMinutes: recipe.prepTimeMinutes ?? null,
      cookTimeMinutes: recipe.cookTimeMinutes ?? null,
      notes: recipe.notes ?? null,
      source: recipe.source ?? null,
      ingredients: (recipe.ingredients || []).map((i) =>
        this.mapIngredientToOut(i)
      ),
      categories: (recipe.categories || []).map((c) =>
        this.mapCategoryToOut(c)
      ),
      tags: (recipe.tags || []).map((t) => this.mapTagToOut(t)),
      photos: (recipe.photos || []).map((p) => this.mapPhotoToOut(p)),
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };
  }

  private mapToSummary(
    recipe: Recipe & { photoCount?: number }
  ): RecipeSummary {
    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description ?? null,
      servings: recipe.servings,
      prepTimeMinutes: recipe.prepTimeMinutes ?? null,
      cookTimeMinutes: recipe.cookTimeMinutes ?? null,
      categories: (recipe.categories || []).map((c) =>
        this.mapCategoryToOut(c)
      ),
      tags: (recipe.tags || []).map((t) => this.mapTagToOut(t)),
      photoCount: recipe.photoCount ?? 0,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };
  }

  private mapIngredientToOut(ingredient: Ingredient): IngredientOut {
    return {
      id: ingredient.id,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      notes: ingredient.notes ?? null,
      orderIndex: ingredient.orderIndex,
      createdAt: ingredient.createdAt,
      updatedAt: ingredient.updatedAt,
    };
  }

  private mapCategoryToOut(category: any): CategoryOut {
    return {
      id: category.id,
      name: category.name,
      description: category.description ?? null,
      color: category.color ?? null,
      icon: category.icon ?? null,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private mapTagToOut(tag: any): TagOut {
    return {
      id: tag.id,
      name: tag.name,
      description: tag.description ?? null,
      color: tag.color ?? null,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    };
  }

  private mapPhotoToOut(photo: RecipePhoto): RecipePhotoOut {
    return {
      id: photo.id,
      filename: photo.filename,
      mimeType: photo.mimeType,
      orderIndex: photo.orderIndex,
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
    };
  }
}
