import { createTool, getToolRegistry } from '../tool-registry';

const RECIPES_API_URL =
  process.env['RECIPES_API_URL'] || 'http://recipes.default.svc:3000';

async function recipesGet(path: string) {
  const resp = await fetch(`${RECIPES_API_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok)
    throw new Error(`Recipes API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

/** ─── search_recipes ─────────────────────────────────────────────── */

const searchRecipes = createTool(
  {
    name: 'search_recipes',
    description: 'Search the recipe library by ingredient, cuisine, or tag.',
    category: 'food',
    tags: ['recipe', 'search', 'cooking'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (ingredient, dish name, cuisine, or tag)',
        },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
  },
  async (params) => {
    try {
      const data = await recipesGet(
        `/recipes?q=${encodeURIComponent(params.query as string)}&limit=${
          (params.limit as number) || 10
        }`
      );
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── get_recipe ──────────────────────────────────────────────────── */

const getRecipe = createTool(
  {
    name: 'get_recipe',
    description:
      'Get full recipe detail including ingredients, steps, and nutrition.',
    category: 'food',
    tags: ['recipe', 'cooking'],
    parameters: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string', description: 'Recipe ID' },
      },
      required: ['recipe_id'],
    },
  },
  async (params) => {
    try {
      const data = await recipesGet(`/recipes/${params.recipe_id}`);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── suggest_recipe_from_ingredients ──────────────────────────────── */

const suggestRecipeFromIngredients = createTool(
  {
    name: 'suggest_recipe_from_ingredients',
    description:
      'Suggest recipes based on available ingredients ("What can I make with chicken, lemon, garlic?").',
    category: 'food',
    tags: ['recipe', 'ingredients', 'suggestion'],
    parameters: {
      type: 'object',
      properties: {
        ingredients: {
          type: 'array',
          description: 'List of available ingredients',
          items: { type: 'string', description: 'Ingredient' },
        },
        limit: { type: 'number', description: 'Max suggestions (default: 5)' },
      },
      required: ['ingredients'],
    },
  },
  async (params) => {
    const ingredients = params.ingredients as string[];
    try {
      const data = await recipesGet(
        `/recipes/suggest?ingredients=${encodeURIComponent(
          ingredients.join(',')
        )}&limit=${(params.limit as number) || 5}`
      );
      return { success: true, data };
    } catch (err) {
      // Fallback: simple search by first ingredient
      try {
        const fallback = await recipesGet(
          `/recipes?q=${encodeURIComponent(ingredients[0])}&limit=${
            (params.limit as number) || 5
          }`
        );
        return {
          success: true,
          data: {
            note: 'Ingredient-match endpoint not available; showing search results for primary ingredient.',
            ...fallback,
          },
        };
      } catch (err2) {
        return {
          success: false,
          error: err2 instanceof Error ? err2.message : String(err2),
        };
      }
    }
  }
);

/** ─── scale_recipe ──────────────────────────────────────────────────── */

const scaleRecipe = createTool(
  {
    name: 'scale_recipe',
    description:
      'Scale a recipe to a different serving size, recomputing all ingredient quantities.',
    category: 'food',
    tags: ['recipe', 'scaling'],
    parameters: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string', description: 'Recipe ID to scale' },
        original_servings: {
          type: 'number',
          description: 'Original serving count',
        },
        desired_servings: {
          type: 'number',
          description: 'Desired serving count',
        },
      },
      required: ['recipe_id', 'original_servings', 'desired_servings'],
    },
  },
  async (params) => {
    try {
      const recipe = await recipesGet(`/recipes/${params.recipe_id}`);
      const factor =
        (params.desired_servings as number) /
        (params.original_servings as number);

      // Scale numeric quantities in ingredients
      const scaleIngredient = (ingredient: any) => {
        if (!ingredient) return ingredient;
        if (typeof ingredient === 'string') {
          return ingredient.replace(/(\d+(\.\d+)?)/g, (match) => {
            const n = parseFloat(match) * factor;
            return Number.isInteger(n) ? String(n) : n.toFixed(2);
          });
        }
        if (ingredient.quantity != null) {
          return { ...ingredient, quantity: ingredient.quantity * factor };
        }
        return ingredient;
      };

      const scaledIngredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map(scaleIngredient)
        : recipe.ingredients;

      return {
        success: true,
        data: {
          ...recipe,
          originalServings: params.original_servings,
          scaledServings: params.desired_servings,
          scaleFactor: factor,
          ingredients: scaledIngredients,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

const registry = getToolRegistry();
registry.register(searchRecipes);
registry.register(getRecipe);
registry.register(suggestRecipeFromIngredients);
registry.register(scaleRecipe);

export {
  searchRecipes,
  getRecipe,
  suggestRecipeFromIngredients,
  scaleRecipe,
};
