import { inject } from '@ee/di';
import { Database } from '../data-source';
import { Recipe } from '../recipes/recipe.entity';
import { Ingredient } from '../recipes/ingredient.entity';
import { z } from 'zod';

export const GroceryItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  recipes: z.array(z.string()), // Recipe titles that need this ingredient
});

export type GroceryItem = z.infer<typeof GroceryItemSchema>;

export const GroceryListSchema = z.object({
  items: z.array(GroceryItemSchema),
  recipeCount: z.number(),
  totalServings: z.number(),
});

export type GroceryList = z.infer<typeof GroceryListSchema>;

export interface GroceryListRequest {
  recipes: Array<{
    recipeId: string;
    servings: number; // Desired servings for this recipe
  }>;
}

export class GroceryListService {
  private readonly _recipeRepository = inject(Database).repositoryFor(Recipe);

  /**
   * Generate a grocery list from selected recipes
   */
  async generate(request: GroceryListRequest): Promise<GroceryList> {
    // Fetch all recipes with ingredients
    const recipeIds = request.recipes.map((r) => r.recipeId);
    const recipes = await this._recipeRepository
      .createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.ingredients', 'ingredient')
      .whereInIds(recipeIds)
      .getMany();

    // Create a map of recipeId -> servings multiplier
    const servingsMap = new Map<string, number>();
    for (const r of request.recipes) {
      const recipe = recipes.find((rec) => rec.id === r.recipeId);
      if (recipe) {
        servingsMap.set(r.recipeId, r.servings / recipe.servings);
      }
    }

    // Aggregate ingredients
    // Key: normalized ingredient name + unit
    const aggregated = new Map<
      string,
      {
        name: string;
        quantity: number;
        unit: string;
        recipes: Set<string>;
      }
    >();

    for (const recipe of recipes) {
      const multiplier = servingsMap.get(recipe.id) ?? 1;

      for (const ingredient of recipe.ingredients) {
        const key = `${ingredient.name.toLowerCase().trim()}|${ingredient.unit
          .toLowerCase()
          .trim()}`;

        if (aggregated.has(key)) {
          const existing = aggregated.get(key)!;
          existing.quantity += ingredient.quantity * multiplier;
          existing.recipes.add(recipe.title);
        } else {
          aggregated.set(key, {
            name: ingredient.name,
            quantity: ingredient.quantity * multiplier,
            unit: ingredient.unit,
            recipes: new Set([recipe.title]),
          });
        }
      }
    }

    // Convert to output format
    const items: GroceryItem[] = Array.from(aggregated.values())
      .map((item) => ({
        name: item.name,
        quantity: Math.round(item.quantity * 100) / 100, // Round to 2 decimal places
        unit: item.unit,
        recipes: Array.from(item.recipes),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalServings = request.recipes.reduce(
      (sum, r) => sum + r.servings,
      0
    );

    return {
      items,
      recipeCount: recipes.length,
      totalServings,
    };
  }
}
